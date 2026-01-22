import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper type definitions
interface DelayJob {
  session_id: string;
  user_id: string;
  status: string;
  run_at: string;
  attempts: number;
  last_error: string | null;
  updated_at: string;
}

interface FlowNode {
  id: string;
  type: string;
}

interface SessionData {
  id: string;
  status: string;
  current_node_id: string | null;
  timeout_at: string | null;
  variables: Record<string, unknown> | null;
  flow: { nodes: FlowNode[] } | null;
}

interface ProcessJobResult {
  success: boolean;
  processed: boolean;
  error?: string;
  rescheduled?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log("[process-delay-queue] Starting delay queue processing...");
    
    // Find jobs that are ready to run
    const now = new Date().toISOString();
    const { data: pendingJobs, error: fetchError } = await supabase
      .from("inbox_flow_delay_jobs")
      .select("*")
      .eq("status", "scheduled")
      .lte("run_at", now)
      .order("run_at", { ascending: true })
      .limit(50); // Process up to 50 jobs per run
    
    if (fetchError) {
      console.error("[process-delay-queue] Error fetching pending jobs:", fetchError);
      throw fetchError;
    }
    
    let processed = 0;
    let failed = 0;
    
    if (!pendingJobs || pendingJobs.length === 0) {
      console.log("[process-delay-queue] No pending jobs found");
    } else {
      console.log(`[process-delay-queue] Found ${pendingJobs.length} pending jobs - processing in PARALLEL`);
      
      // Process all jobs in parallel using Promise.allSettled
      const processJobAsync = async (job: DelayJob): Promise<ProcessJobResult> => {
        try {
          // Mark job as processing
          const { error: updateError } = await supabase
            .from("inbox_flow_delay_jobs")
            .update({ 
              status: "processing", 
              attempts: job.attempts + 1,
              updated_at: new Date().toISOString()
            })
            .eq("session_id", job.session_id)
            .eq("status", "scheduled"); // Ensure it wasn't picked up by another worker
          
          if (updateError) {
            console.error(`[process-delay-queue] Error updating job ${job.session_id}:`, updateError);
            return { success: false, processed: false, error: updateError.message };
          }
          
          console.log(`[process-delay-queue] Processing job for session ${job.session_id}`);
          
          // Check if this is a timeout job (session has timeout_at set and is waiting for input)
          const { data: session } = await supabase
            .from("inbox_flow_sessions")
            .select("*, flow:inbox_flows(nodes)")
            .eq("id", job.session_id)
            .single();
          
          if (!session) {
            console.log(`[process-delay-queue] Session ${job.session_id} not found, marking job as done`);
            await supabase
              .from("inbox_flow_delay_jobs")
              .update({ status: "done", updated_at: new Date().toISOString() })
              .eq("session_id", job.session_id);
            return { success: true, processed: false };
          }
          
          // Check session variables for pending delay info
          const sessionVars = (session.variables || {}) as Record<string, unknown>;
          const pendingDelay = sessionVars._pendingDelay as { nodeId: string; resumeAt: number } | undefined;
          
          // If session is completed BUT has pending delay, try to reactivate it
          if (session.status === 'completed') {
            if (pendingDelay) {
              console.log(`[process-delay-queue] Session ${job.session_id} was prematurely completed but has pending delay, reactivating`);
              await supabase
                .from("inbox_flow_sessions")
                .update({ 
                  status: "active", 
                  updated_at: new Date().toISOString() 
                })
                .eq("id", job.session_id);
            } else {
              console.log(`[process-delay-queue] Session ${job.session_id} already completed (no pending delay), marking job as done`);
              await supabase
                .from("inbox_flow_delay_jobs")
                .update({ status: "done", updated_at: new Date().toISOString() })
                .eq("session_id", job.session_id);
              return { success: true, processed: false };
            }
          }
          
          // Determine if this is a timeout or a delay job
          const isTimeoutJob = session.timeout_at !== null;
          const flowNodes = (session.flow?.nodes || []) as FlowNode[];
          const currentNode = flowNodes.find(n => n.id === session.current_node_id);
          const isWaitingForInput = currentNode?.type === 'waitInput' || currentNode?.type === 'menu' || currentNode?.type === 'iaConverter' || currentNode?.type === 'interactiveBlock';
          const isIaConverterNode = currentNode?.type === 'iaConverter';
          const isDelayNode = currentNode?.type === 'delay';
          const isPaymentIdentifier = currentNode?.type === 'paymentIdentifier';
          
          const hasPendingUserInput = sessionVars._pending_user_input !== undefined;
          
          // CRITICAL FIX: If current node is waitInput/menu and there's a timeout_at set,
          // this session is waiting for user input - don't process delay jobs that aren't timeouts!
          const isActuallyWaitingForInput = isWaitingForInput || (session.timeout_at !== null && !pendingDelay);
          
          // More robust detection: check if we have a pending delay in variables
          const hasValidPendingDelay = pendingDelay && pendingDelay.resumeAt <= Date.now();
          const hasPendingDelayNotReady = pendingDelay && pendingDelay.resumeAt > Date.now();
          
          // Check for pause schedule
          const hasPauseScheduled = sessionVars._pause_scheduled === true;
          const pauseResumeAt = sessionVars._pause_resume_at as number | undefined;
          const pauseReady = hasPauseScheduled && pauseResumeAt && pauseResumeAt <= Date.now();
          
          // Check for paymentIdentifier noResponse delay
          const paymentNoResponseDelayKey = `_payment_no_response_delay_${session.current_node_id}`;
          const hasPaymentNoResponseDelay = sessionVars[paymentNoResponseDelayKey] !== undefined;
          
          console.log(`[process-delay-queue] Session ${job.session_id}: isTimeoutJob=${isTimeoutJob}, isWaitingForInput=${isWaitingForInput}, isActuallyWaitingForInput=${isActuallyWaitingForInput}, isDelayNode=${isDelayNode}, isPaymentIdentifier=${isPaymentIdentifier}, hasValidPendingDelay=${hasValidPendingDelay}, hasPendingDelayNotReady=${hasPendingDelayNotReady}, hasPaymentNoResponseDelay=${hasPaymentNoResponseDelay}, hasPauseScheduled=${hasPauseScheduled}, pauseReady=${pauseReady}, nodeType=${currentNode?.type}, hasPendingUserInput=${hasPendingUserInput}`);

          const rescheduleIfLocked = async (invokeResult: unknown): Promise<boolean> => {
            const isLockedSkip =
              !!invokeResult &&
              typeof invokeResult === 'object' &&
              (invokeResult as any).skipped === true &&
              (invokeResult as any).reason === 'session_locked';

            if (!isLockedSkip) return false;

            const retryAt = new Date(Date.now() + 15_000).toISOString();
            console.log(
              `[process-delay-queue] Session ${job.session_id} still locked; rescheduling job to ${retryAt}`
            );

            await supabase
              .from('inbox_flow_delay_jobs')
              .update({
                status: 'scheduled',
                run_at: retryAt,
                updated_at: new Date().toISOString(),
              })
              .eq('session_id', job.session_id);

            return true;
          };

          // IMPORTANT: If there's a pending delay that hasn't expired yet, reschedule the job!
          if (hasPendingDelayNotReady) {
            const remainingMs = pendingDelay!.resumeAt - Date.now();
            console.log(`[process-delay-queue] Session ${job.session_id} has pending delay not ready yet, ${remainingMs}ms remaining. Rescheduling job.`);

            await supabase
              .from("inbox_flow_delay_jobs")
              .update({ 
                run_at: new Date(pendingDelay!.resumeAt).toISOString(),
                status: "scheduled",
                updated_at: new Date().toISOString()
              })
              .eq("session_id", job.session_id);

            console.log(`[process-delay-queue] Job rescheduled to ${new Date(pendingDelay!.resumeAt).toISOString()}`);
            return { success: true, processed: false, rescheduled: true };
          }

          // === HANDLE iaConverterPendingInput JOB TYPE ===
          if (isIaConverterNode && hasPendingUserInput) {
            console.log(`[process-delay-queue] iaConverter pending input job for session ${job.session_id}, invoking process-inbox-flow`);

            const { data: invokeResult, error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
              body: {
                sessionId: job.session_id,
              },
            });

            if (invokeError) {
              console.error(`[process-delay-queue] Error invoking process-inbox-flow for iaConverter pending input ${job.session_id}:`, invokeError);
              const newStatus = job.attempts >= 2 ? "failed" : "scheduled";
              await supabase
                .from("inbox_flow_delay_jobs")
                .update({ 
                  status: newStatus,
                  last_error: invokeError.message || "Unknown error",
                  run_at: new Date(Date.now() + 5000).toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq("session_id", job.session_id);
              return { success: false, processed: false, error: invokeError.message };
            }

            if (await rescheduleIfLocked(invokeResult)) {
              return { success: true, processed: false, rescheduled: true };
            }

            console.log(`[process-delay-queue] iaConverter pending input job result for ${job.session_id}:`, invokeResult);
            
            await supabase
              .from("inbox_flow_delay_jobs")
              .update({ status: "done", updated_at: new Date().toISOString() })
              .eq("session_id", job.session_id);
            return { success: true, processed: true };
          }

          // If this is a timeout job and session is still waiting for input, trigger timeout
          if (isTimeoutJob && isActuallyWaitingForInput) {
            console.log(`[process-delay-queue] Timeout expired for session ${job.session_id}, continuing flow`);

            const { data: invokeResult, error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
              body: {
                sessionId: job.session_id,
                resumeFromTimeout: true,
              },
            });

            if (invokeError) {
              console.error(`[process-delay-queue] Error invoking process-inbox-flow for timeout ${job.session_id}:`, invokeError);
              const newStatus = job.attempts >= 2 ? "failed" : "scheduled";
              await supabase
                .from("inbox_flow_delay_jobs")
                .update({ 
                  status: newStatus,
                  last_error: invokeError.message || "Unknown error",
                  updated_at: new Date().toISOString()
                })
                .eq("session_id", job.session_id);
              return { success: false, processed: false, error: invokeError.message };
            }

            if (await rescheduleIfLocked(invokeResult)) {
              return { success: true, processed: false, rescheduled: true };
            }

            console.log(`[process-delay-queue] Timeout job result for ${job.session_id}:`, invokeResult);
          } else if (isTimeoutJob && isPaymentIdentifier && hasPaymentNoResponseDelay) {
            // PaymentIdentifier "no response" timeout
            console.log(`[process-delay-queue] PaymentIdentifier no-response timeout for session ${job.session_id}`);

            const { data: invokeResult, error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
              body: {
                sessionId: job.session_id,
                resumeFromTimeout: true,
              },
            });

            if (invokeError) {
              console.error(`[process-delay-queue] Error invoking process-inbox-flow for paymentIdentifier timeout ${job.session_id}:`, invokeError);
              const newStatus = job.attempts >= 2 ? "failed" : "scheduled";
              await supabase
                .from("inbox_flow_delay_jobs")
                .update({ 
                  status: newStatus,
                  last_error: invokeError.message || "Unknown error",
                  updated_at: new Date().toISOString()
                })
                .eq("session_id", job.session_id);
              return { success: false, processed: false, error: invokeError.message };
            }

            if (await rescheduleIfLocked(invokeResult)) {
              return { success: true, processed: false, rescheduled: true };
            }

            console.log(`[process-delay-queue] PaymentIdentifier timeout job result for ${job.session_id}:`, invokeResult);
          } else if (pauseReady) {
            // This is a pause schedule job - resume flow after pause ended
            console.log(`[process-delay-queue] Pause schedule completed for session ${job.session_id}, resuming flow`);

            const { data: invokeResult, error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
              body: {
                sessionId: job.session_id,
                resumeFromDelay: true,
              },
            });

            if (invokeError) {
              console.error(`[process-delay-queue] Error invoking process-inbox-flow for pause resume ${job.session_id}:`, invokeError);

              const newStatus = job.attempts >= 2 ? "failed" : "scheduled";
              await supabase
                .from("inbox_flow_delay_jobs")
                .update({ 
                  status: newStatus,
                  last_error: invokeError.message || "Unknown error",
                  updated_at: new Date().toISOString()
                })
                .eq("session_id", job.session_id);

              return { success: false, processed: false, error: invokeError.message };
            }

            if (await rescheduleIfLocked(invokeResult)) {
              return { success: true, processed: false, rescheduled: true };
            }

            console.log(`[process-delay-queue] Pause resume job result for ${job.session_id}:`, invokeResult);
          } else if (hasValidPendingDelay || isDelayNode) {
            // This is a delay job (either has pending delay or current node is delay)
            console.log(`[process-delay-queue] Delay completed for session ${job.session_id}, resuming flow`);

            const { data: invokeResult, error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
              body: {
                sessionId: job.session_id,
                resumeFromDelay: true,
              },
            });

            if (invokeError) {
              console.error(`[process-delay-queue] Error invoking process-inbox-flow for delay ${job.session_id}:`, invokeError);

              const newStatus = job.attempts >= 2 ? "failed" : "scheduled";
              await supabase
                .from("inbox_flow_delay_jobs")
                .update({ 
                  status: newStatus,
                  last_error: invokeError.message || "Unknown error",
                  updated_at: new Date().toISOString()
                })
                .eq("session_id", job.session_id);

              return { success: false, processed: false, error: invokeError.message };
            }

            if (await rescheduleIfLocked(invokeResult)) {
              return { success: true, processed: false, rescheduled: true };
            }

            console.log(`[process-delay-queue] Delay job result for ${job.session_id}:`, invokeResult);
          } else {
            console.log(`[process-delay-queue] Job ${job.session_id} doesn't match timeout or delay criteria, marking as done (node: ${currentNode?.type})`);
          }
          
          // Mark job as done
          await supabase
            .from("inbox_flow_delay_jobs")
            .update({ 
              status: "done",
              updated_at: new Date().toISOString()
            })
            .eq("session_id", job.session_id);
          
          console.log(`[process-delay-queue] Successfully processed job for session ${job.session_id}`);
          return { success: true, processed: true };
          
        } catch (jobError: unknown) {
          const errorMessage = jobError instanceof Error ? jobError.message : "Unexpected error";
          console.error(`[process-delay-queue] Unexpected error processing job ${job.session_id}:`, jobError);
          
          await supabase
            .from("inbox_flow_delay_jobs")
            .update({ 
              status: job.attempts >= 2 ? "failed" : "scheduled",
              last_error: errorMessage,
              updated_at: new Date().toISOString()
            })
            .eq("session_id", job.session_id);
          
          return { success: false, processed: false, error: errorMessage };
        }
      };

      // Process all jobs in parallel with Promise.allSettled
      const results = await Promise.allSettled(pendingJobs.map(job => processJobAsync(job)));
      
      // Count results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.processed) {
            processed++;
          }
          if (!result.value.success && !result.value.rescheduled) {
            failed++;
          }
        } else {
          failed++;
        }
      }
      
      console.log(`[process-delay-queue] Parallel processing completed: ${processed} processed, ${failed} failed`);
    }
    
    console.log(`[process-delay-queue] Job processing completed: ${processed} processed, ${failed} failed`);
    
    // === DELAY HEALING: Find active sessions with _pendingDelay.resumeAt already passed ===
    console.log("[process-delay-queue] Checking for expired _pendingDelay that need healing...");
    
    const delayHealingResult = await supabase
      .from("inbox_flow_sessions")
      .select("id, current_node_id, variables")
      .eq("status", "active")
      .limit(50);
    
    if (delayHealingResult.error) {
      console.error("[process-delay-queue] Error fetching sessions for delay healing:", delayHealingResult.error);
    } else if (delayHealingResult.data && delayHealingResult.data.length > 0) {
      const nowMs = Date.now();
      
      // Filter sessions that need healing
      const sessionsNeedingHealing: { id: string; expiredByMs: number }[] = [];
      
      for (const session of delayHealingResult.data) {
        const vars = (session.variables || {}) as Record<string, unknown>;
        const pendingDelay = vars._pendingDelay as { nodeId?: string; resumeAt?: number } | undefined;
        
        if (pendingDelay && pendingDelay.resumeAt && pendingDelay.resumeAt < nowMs) {
          const { data: existingJob } = await supabase
            .from("inbox_flow_delay_jobs")
            .select("session_id, status")
            .eq("session_id", session.id)
            .eq("status", "scheduled")
            .maybeSingle();
          
          if (!existingJob) {
            sessionsNeedingHealing.push({
              id: session.id,
              expiredByMs: nowMs - pendingDelay.resumeAt
            });
          }
        }
      }
      
      if (sessionsNeedingHealing.length > 0) {
        console.log(`[process-delay-queue] Healing ${sessionsNeedingHealing.length} sessions with expired _pendingDelay in parallel`);
        
        // Heal all sessions in parallel
        const healResults = await Promise.allSettled(
          sessionsNeedingHealing.map(async (s) => {
            console.log(`[process-delay-queue] Healing delay for session ${s.id} - expired ${s.expiredByMs}ms ago`);
            
            const { error: healError } = await supabase.functions.invoke("process-inbox-flow", {
              body: {
                sessionId: s.id,
                resumeFromDelay: true,
              },
            });
            
            if (healError) {
              console.error(`[process-delay-queue] Error healing delay for session ${s.id}:`, healError);
              throw healError;
            }
            
            console.log(`[process-delay-queue] Successfully healed delay for session ${s.id}`);
            return true;
          })
        );
        
        const delayHealed = healResults.filter(r => r.status === 'fulfilled').length;
        console.log(`[process-delay-queue] Healed ${delayHealed}/${sessionsNeedingHealing.length} sessions with expired _pendingDelay`);
      } else {
        console.log("[process-delay-queue] No expired _pendingDelay sessions need healing");
      }
    }
    
    // === CLEANUP ORPHAN SESSIONS: Mark sessions with timeout expired > 24h as failed ===
    console.log("[process-delay-queue] Checking for orphan sessions (timeout expired > 24h)...");
    
    const orphanCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
    
    const { data: orphanSessions, error: orphanError } = await supabase
      .from("inbox_flow_sessions")
      .select("id, timeout_at")
      .eq("status", "active")
      .not("timeout_at", "is", null)
      .lt("timeout_at", orphanCutoff)
      .limit(100);
    
    if (orphanError) {
      console.error("[process-delay-queue] Error fetching orphan sessions:", orphanError);
    } else if (orphanSessions && orphanSessions.length > 0) {
      console.log(`[process-delay-queue] Found ${orphanSessions.length} orphan sessions (timeout > 24h), marking as failed`);
      
      const orphanIds = orphanSessions.map(s => s.id);
      
      await supabase
        .from("inbox_flow_sessions")
        .update({ 
          status: 'failed', 
          timeout_at: null,
          processing: false,
          processing_started_at: null 
        })
        .in("id", orphanIds);
      
      // Also mark related delay jobs as failed
      await supabase
        .from("inbox_flow_delay_jobs")
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .in("session_id", orphanIds)
        .neq("status", "done");
      
      console.log(`[process-delay-queue] Marked ${orphanSessions.length} orphan sessions as failed`);
    } else {
      console.log("[process-delay-queue] No orphan sessions need cleanup");
    }
    
    // === TIMEOUT HEALING: Find sessions with expired timeout that still need processing ===
    console.log("[process-delay-queue] Checking for expired timeouts that need healing...");
    
    const expiredResult = await supabase
      .from("inbox_flow_sessions")
      .select("id, current_node_id, timeout_at, contact_id, flow:inbox_flows(nodes)")
      .eq("status", "active")
      .not("timeout_at", "is", null)
      .lt("timeout_at", new Date().toISOString())
      .gte("timeout_at", orphanCutoff) // Only heal recent ones, not orphans (> 24h)
      .limit(20);
    
    const expiredTimeoutSessions = expiredResult.data as Array<{ id: string; current_node_id: string; timeout_at: string; contact_id: string; flow: { nodes: FlowNode[] } | null }> | null;
    const expiredError = expiredResult.error;
    
    if (expiredError) {
      console.error("[process-delay-queue] Error fetching expired sessions:", expiredError);
    } else if (expiredTimeoutSessions && expiredTimeoutSessions.length > 0) {
      console.log(`[process-delay-queue] Found ${expiredTimeoutSessions.length} expired timeout sessions to heal in parallel`);
      
      // Get contact info for all sessions to check for valid instance_id
      const contactIds = [...new Set(expiredTimeoutSessions.map(s => s.contact_id).filter(Boolean))];
      const { data: contacts } = await supabase
        .from("inbox_contacts")
        .select("id, instance_id")
        .in("id", contactIds);
      
      const contactInstanceMap = new Map((contacts || []).map(c => [c.id, c.instance_id]));
      
      // Filter to those needing timeout healing AND have valid instance
      const timeoutableNodeTypes = ['waitInput', 'menu', 'paymentIdentifier'];
      const sessionsToHeal: Array<typeof expiredTimeoutSessions[0]> = [];
      const sessionsWithoutInstance: Array<typeof expiredTimeoutSessions[0]> = [];
      
      for (const s of expiredTimeoutSessions) {
        const flowNodes = (s.flow?.nodes || []) as FlowNode[];
        const currentNode = flowNodes.find(n => n.id === s.current_node_id);
        const hasValidNodeType = currentNode && timeoutableNodeTypes.includes(currentNode.type);
        const hasInstance = contactInstanceMap.get(s.contact_id) !== null && contactInstanceMap.get(s.contact_id) !== undefined;
        
        if (hasValidNodeType) {
          if (hasInstance) {
            sessionsToHeal.push(s);
          } else {
            sessionsWithoutInstance.push(s);
          }
        }
      }
      
      // Mark sessions without instance as failed (can't send timeout message without API)
      if (sessionsWithoutInstance.length > 0) {
        console.log(`[process-delay-queue] ${sessionsWithoutInstance.length} sessions have no instance_id, marking as failed`);
        
        const noInstanceIds = sessionsWithoutInstance.map(s => s.id);
        await supabase
          .from("inbox_flow_sessions")
          .update({ 
            status: 'failed', 
            timeout_at: null,
            processing: false,
            processing_started_at: null 
          })
          .in("id", noInstanceIds);
        
        await supabase
          .from("inbox_flow_delay_jobs")
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .in("session_id", noInstanceIds)
          .neq("status", "done");
      }
      
      if (sessionsToHeal.length > 0) {
        const healResults = await Promise.allSettled(
          sessionsToHeal.map(async (s) => {
            console.log(`[process-delay-queue] Healing expired timeout for session ${s.id}`);
            
            const { error: healError } = await supabase.functions.invoke("process-inbox-flow", {
              body: {
                sessionId: s.id,
                resumeFromTimeout: true,
              },
            });
            
            if (healError) {
              console.error(`[process-delay-queue] Error healing session ${s.id}:`, healError);
              throw healError;
            }
            
            console.log(`[process-delay-queue] Successfully healed session ${s.id}`);
            return true;
          })
        );
        
        const healed = healResults.filter(r => r.status === 'fulfilled').length;
        console.log(`[process-delay-queue] Healed ${healed}/${sessionsToHeal.length} expired timeout sessions`);
      }
    } else {
      console.log("[process-delay-queue] No expired timeouts need healing");
    }
    
    // === STALE LOCK HEALING: Find sessions stuck with processing=true for too long ===
    console.log("[process-delay-queue] Checking for stale processing locks that need healing...");
    
    const STALE_LOCK_THRESHOLD_MS = 120_000; // 2 minutes
    const staleLockCutoff = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS).toISOString();
    
    const { data: staleLockSessions, error: staleLockError } = await supabase
      .from("inbox_flow_sessions")
      .select("id, current_node_id, processing_started_at")
      .eq("status", "active")
      .eq("processing", true)
      .lt("processing_started_at", staleLockCutoff)
      .limit(20);
    
    if (staleLockError) {
      console.error("[process-delay-queue] Error fetching stale lock sessions:", staleLockError);
    } else if (staleLockSessions && staleLockSessions.length > 0) {
      console.log(`[process-delay-queue] Found ${staleLockSessions.length} sessions with stale locks - healing in parallel`);
      
      const healResults = await Promise.allSettled(
        staleLockSessions.map(async (staleSession) => {
          const lockAgeMs = Date.now() - new Date(staleSession.processing_started_at || 0).getTime();
          console.log(`[process-delay-queue] Healing stale lock for session ${staleSession.id} (lock age: ${Math.round(lockAgeMs / 1000)}s, node: ${staleSession.current_node_id})`);
          
          // First, forcibly release the lock
          await supabase
            .from("inbox_flow_sessions")
            .update({
              processing: false,
              processing_started_at: null,
              last_interaction: new Date().toISOString(),
            })
            .eq("id", staleSession.id);
          
          // Then, invoke process-inbox-flow to resume
          const { error: healError } = await supabase.functions.invoke("process-inbox-flow", {
            body: {
              sessionId: staleSession.id,
              resumeFromDelay: true,
            },
          });
          
          if (healError) {
            console.error(`[process-delay-queue] Error resuming stale lock session ${staleSession.id}:`, healError);
            throw healError;
          }
          
          console.log(`[process-delay-queue] Successfully healed stale lock for session ${staleSession.id}`);
          return true;
        })
      );
      
      const staleLockHealed = healResults.filter(r => r.status === 'fulfilled').length;
      console.log(`[process-delay-queue] Healed ${staleLockHealed}/${staleLockSessions.length} stale lock sessions`);
    } else {
      console.log("[process-delay-queue] No stale processing locks need healing");
    }
    
    // === STALE JOB HEALING: Find jobs stuck with status='processing' for too long ===
    console.log("[process-delay-queue] Checking for stale processing jobs that need healing...");
    
    const STALE_JOB_THRESHOLD_MS = 300_000; // 5 minutes
    const staleJobCutoff = new Date(Date.now() - STALE_JOB_THRESHOLD_MS).toISOString();
    
    const { data: staleJobs, error: staleJobError } = await supabase
      .from("inbox_flow_delay_jobs")
      .select("*, session:inbox_flow_sessions(id, status, current_node_id, variables)")
      .eq("status", "processing")
      .lt("updated_at", staleJobCutoff)
      .limit(20);
    
    if (staleJobError) {
      console.error("[process-delay-queue] Error fetching stale jobs:", staleJobError);
    } else if (staleJobs && staleJobs.length > 0) {
      console.log(`[process-delay-queue] Found ${staleJobs.length} stale processing jobs to heal in parallel`);
      
      const healResults = await Promise.allSettled(
        staleJobs.map(async (staleJob) => {
          const jobAgeMs = Date.now() - new Date(staleJob.updated_at || 0).getTime();
          console.log(`[process-delay-queue] Healing stale job for session ${staleJob.session_id} (job age: ${Math.round(jobAgeMs / 1000)}s)`);
          
          const session = staleJob.session as { id: string; status: string; current_node_id: string; variables: any } | null;
          
          // If session is still active and has pending delay, resume it
          if (session && session.status === 'active') {
            const vars = (session.variables || {}) as Record<string, unknown>;
            const pendingDelay = vars._pendingDelay as { nodeId?: string; resumeAt?: number } | undefined;
            
            // Check if delay has expired
            if (pendingDelay && pendingDelay.resumeAt && pendingDelay.resumeAt < Date.now()) {
              console.log(`[process-delay-queue] Stale job session ${staleJob.session_id} has expired delay, resuming flow`);
              
              // Release any locks first
              await supabase
                .from("inbox_flow_sessions")
                .update({
                  processing: false,
                  processing_started_at: null,
                })
                .eq("id", session.id);
              
              // Try to resume the flow
              const { error: healError } = await supabase.functions.invoke("process-inbox-flow", {
                body: {
                  sessionId: session.id,
                  resumeFromDelay: true,
                },
              });
              
              if (healError) {
                console.error(`[process-delay-queue] Error resuming stale job session ${staleJob.session_id}:`, healError);
                await supabase
                  .from("inbox_flow_delay_jobs")
                  .update({ 
                    status: "scheduled",
                    run_at: new Date(Date.now() + 30_000).toISOString(),
                    updated_at: new Date().toISOString()
                  })
                  .eq("session_id", staleJob.session_id);
                throw healError;
              }
              
              await supabase
                .from("inbox_flow_delay_jobs")
                .update({ 
                  status: "done",
                  updated_at: new Date().toISOString()
                })
                .eq("session_id", staleJob.session_id);
              console.log(`[process-delay-queue] Successfully healed stale job for session ${staleJob.session_id}`);
            } else {
              // No expired delay, just reschedule the job
              console.log(`[process-delay-queue] Stale job session ${staleJob.session_id} has no expired delay, rescheduling`);
              const runAt = pendingDelay?.resumeAt 
                ? new Date(pendingDelay.resumeAt).toISOString()
                : new Date(Date.now() + 30_000).toISOString();
              
              await supabase
                .from("inbox_flow_delay_jobs")
                .update({ 
                  status: "scheduled",
                  run_at: runAt,
                  updated_at: new Date().toISOString()
                })
                .eq("session_id", staleJob.session_id);
            }
          } else {
            // Session not active or doesn't exist, mark job as done
            console.log(`[process-delay-queue] Stale job session ${staleJob.session_id} is not active, marking job as done`);
            await supabase
              .from("inbox_flow_delay_jobs")
              .update({ 
                status: "done",
                updated_at: new Date().toISOString()
              })
              .eq("session_id", staleJob.session_id);
          }
          
          return true;
        })
      );
      
      const staleJobsHealed = healResults.filter(r => r.status === 'fulfilled').length;
      console.log(`[process-delay-queue] Healed ${staleJobsHealed}/${staleJobs.length} stale processing jobs`);
    } else {
      console.log("[process-delay-queue] No stale processing jobs need healing");
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processed, 
        failed,
        total: pendingJobs?.length || 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[process-delay-queue] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
