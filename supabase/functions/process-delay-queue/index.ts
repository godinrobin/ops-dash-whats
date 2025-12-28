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
    
    if (!pendingJobs || pendingJobs.length === 0) {
      console.log("[process-delay-queue] No pending jobs found");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending jobs" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[process-delay-queue] Found ${pendingJobs.length} pending jobs`);
    
    let processed = 0;
    let failed = 0;
    
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
        
        // Determine if this is a timeout or a delay job
        const isTimeoutJob = session.timeout_at !== null;
        const flowNodes = (session.flow?.nodes || []) as Array<{ id: string; type: string }>;
        const currentNode = flowNodes.find(n => n.id === session.current_node_id);
        const isWaitingForInput = currentNode?.type === 'waitInput' || currentNode?.type === 'menu';
        
        console.log(`[process-delay-queue] Session status: isTimeoutJob=${isTimeoutJob}, isWaitingForInput=${isWaitingForInput}, nodeType=${currentNode?.type}`);
        
        // If this is a timeout job and session is still waiting for input, trigger timeout
        if (isTimeoutJob && isWaitingForInput) {
          console.log(`[process-delay-queue] Timeout expired for session ${job.session_id}, continuing flow`);
          
          const { error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
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
        } else {
          // This is a regular delay job, call process-inbox-flow to resume
          const { error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
            body: {
              sessionId: job.session_id,
              resumeFromDelay: true,
            },
          });
          
          if (invokeError) {
            console.error(`[process-delay-queue] Error invoking process-inbox-flow for ${job.session_id}:`, invokeError);
            
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
    
    console.log(`[process-delay-queue] Completed: ${processed} processed, ${failed} failed`);
    
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
