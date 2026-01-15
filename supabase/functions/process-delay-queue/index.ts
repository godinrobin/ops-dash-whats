import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      console.log(`[process-delay-queue] Found ${pendingJobs.length} pending jobs`);
    
      for (const job of pendingJobs) {
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
          continue;
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
          continue;
        }
        
        // Check session variables for pending delay info
        const sessionVars = (session.variables || {}) as Record<string, unknown>;
        const pendingDelay = sessionVars._pendingDelay as { nodeId: string; resumeAt: number } | undefined;
        
        // If session is completed BUT has pending delay, try to reactivate it
        if (session.status === 'completed') {
          if (pendingDelay) {
            console.log(`[process-delay-queue] Session ${job.session_id} was prematurely completed but has pending delay, reactivating`);
            // Reactivate the session so the delay can be processed
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
            continue;
          }
        }
        
        // Determine if this is a timeout or a delay job
        const isTimeoutJob = session.timeout_at !== null;
        const flowNodes = (session.flow?.nodes || []) as Array<{ id: string; type: string }>;
        const currentNode = flowNodes.find(n => n.id === session.current_node_id);
        const isWaitingForInput = currentNode?.type === 'waitInput' || currentNode?.type === 'menu';
        const isDelayNode = currentNode?.type === 'delay';
        const isPaymentIdentifier = currentNode?.type === 'paymentIdentifier';
        
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
        
        console.log(`[process-delay-queue] Session ${job.session_id}: isTimeoutJob=${isTimeoutJob}, isWaitingForInput=${isWaitingForInput}, isDelayNode=${isDelayNode}, isPaymentIdentifier=${isPaymentIdentifier}, hasValidPendingDelay=${hasValidPendingDelay}, hasPendingDelayNotReady=${hasPendingDelayNotReady}, hasPaymentNoResponseDelay=${hasPaymentNoResponseDelay}, hasPauseScheduled=${hasPauseScheduled}, pauseReady=${pauseReady}, nodeType=${currentNode?.type}`);
        
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
          continue; // Skip to next job
        }
        
        // If this is a timeout job and session is still waiting for input, trigger timeout
        if (isTimeoutJob && isWaitingForInput) {
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
            failed++;
            continue;
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
            failed++;
            continue;
          }
          
          console.log(`[process-delay-queue] PaymentIdentifier timeout job result for ${job.session_id}:`, invokeResult);
        } else if (pauseReady) {
          // This is a pause schedule job - resume flow after pause ended
          console.log(`[process-delay-queue] Pause schedule completed for session ${job.session_id}, resuming flow`);
          
          const { data: invokeResult, error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
            body: {
              sessionId: job.session_id,
              resumeFromDelay: true, // Reuse delay resume logic
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
            
            failed++;
            continue;
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
            
            // Mark as failed if max attempts reached, otherwise back to scheduled
            const newStatus = job.attempts >= 2 ? "failed" : "scheduled";
            await supabase
              .from("inbox_flow_delay_jobs")
              .update({ 
                status: newStatus,
                last_error: invokeError.message || "Unknown error",
                updated_at: new Date().toISOString()
              })
              .eq("session_id", job.session_id);
            
            failed++;
            continue;
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
        
        processed++;
        console.log(`[process-delay-queue] Successfully processed job for session ${job.session_id}`);
        
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
        
        failed++;
      }
    }
    } // Close else block for pendingJobs check
    
    console.log(`[process-delay-queue] Completed: ${processed} processed, ${failed} failed`);
    
    // === DELAY HEALING: Find active sessions with _pendingDelay.resumeAt already passed ===
    // This catches cases where the delay job was completed but process-inbox-flow failed to continue
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
      let delayHealed = 0;
      
      for (const session of delayHealingResult.data) {
        try {
          const vars = (session.variables || {}) as Record<string, unknown>;
          const pendingDelay = vars._pendingDelay as { nodeId?: string; resumeAt?: number } | undefined;
          
          if (pendingDelay && pendingDelay.resumeAt && pendingDelay.resumeAt < nowMs) {
            // Check if there's already a scheduled job for this session
            const { data: existingJob } = await supabase
              .from("inbox_flow_delay_jobs")
              .select("session_id, status")
              .eq("session_id", session.id)
              .eq("status", "scheduled")
              .maybeSingle();
            
            if (!existingJob) {
              const expiredByMs = nowMs - pendingDelay.resumeAt;
              console.log(`[process-delay-queue] Healing delay for session ${session.id} - expired ${expiredByMs}ms ago`);
              
              // Invoke process-inbox-flow to resume from delay
              const { error: healError } = await supabase.functions.invoke("process-inbox-flow", {
                body: {
                  sessionId: session.id,
                  resumeFromDelay: true,
                },
              });
              
              if (healError) {
                console.error(`[process-delay-queue] Error healing delay for session ${session.id}:`, healError);
              } else {
                delayHealed++;
                console.log(`[process-delay-queue] Successfully healed delay for session ${session.id}`);
              }
            }
          }
        } catch (delayHealErr) {
          console.error(`[process-delay-queue] Unexpected error healing delay for session ${session.id}:`, delayHealErr);
        }
      }
      
      if (delayHealed > 0) {
        console.log(`[process-delay-queue] Healed ${delayHealed} sessions with expired _pendingDelay`);
      } else {
        console.log("[process-delay-queue] No expired _pendingDelay sessions need healing");
      }
    }
    
    // === TIMEOUT HEALING: Find sessions with expired timeout that still need processing ===
    // This catches cases where timeout job was marked 'done' but flow didn't continue
    console.log("[process-delay-queue] Checking for expired timeouts that need healing...");
    
    const expiredResult = await supabase
      .from("inbox_flow_sessions")
      .select("id, current_node_id, timeout_at, flow:inbox_flows(nodes)")
      .eq("status", "active")
      .not("timeout_at", "is", null)
      .lt("timeout_at", new Date().toISOString())
      .limit(20);
    
    const expiredTimeoutSessions = expiredResult.data as Array<{ id: string; current_node_id: string; timeout_at: string; flow: { nodes: any[] } | null }> | null;
    const expiredError = expiredResult.error;
    
    if (expiredError) {
      console.error("[process-delay-queue] Error fetching expired sessions:", expiredError);
    } else if (expiredTimeoutSessions && expiredTimeoutSessions.length > 0) {
      console.log(`[process-delay-queue] Found ${expiredTimeoutSessions.length} expired timeout sessions to heal`);
      
      let healed = 0;
      for (const expiredSession of expiredTimeoutSessions) {
        try {
          // Verify session is still at a node that supports timeout
          const flowNodes = (expiredSession.flow?.nodes || []) as Array<{ id: string; type: string }>;
          const currentNode = flowNodes.find(n => n.id === expiredSession.current_node_id);
          
          // Include paymentIdentifier in timeout healing - it also waits for user input/payment
          const timeoutableNodeTypes = ['waitInput', 'menu', 'paymentIdentifier'];
          if (currentNode && timeoutableNodeTypes.includes(currentNode.type)) {
            console.log(`[process-delay-queue] Healing expired timeout for session ${expiredSession.id} (node: ${currentNode.type})`);
            
            const { error: healError } = await supabase.functions.invoke("process-inbox-flow", {
              body: {
                sessionId: expiredSession.id,
                resumeFromTimeout: true,
              },
            });
            
            if (healError) {
              console.error(`[process-delay-queue] Error healing session ${expiredSession.id}:`, healError);
            } else {
              healed++;
              console.log(`[process-delay-queue] Successfully healed session ${expiredSession.id}`);
            }
          }
        } catch (healErr) {
          console.error(`[process-delay-queue] Unexpected error healing session ${expiredSession.id}:`, healErr);
        }
      }
      
      console.log(`[process-delay-queue] Healed ${healed}/${expiredTimeoutSessions.length} expired timeout sessions`);
    } else {
      console.log("[process-delay-queue] No expired timeouts need healing");
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processed, 
        failed,
        total: pendingJobs.length
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
