import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cleanup sessions stuck in processing state for more than 5 minutes
// This function can be called via a cron job to ensure flows don't get permanently stuck
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[cleanup-stuck-sessions] Starting cleanup...');

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find and unlock sessions stuck in processing for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // First, get the count of stuck sessions for logging
    const { data: stuckSessions, error: selectError } = await supabaseClient
      .from('inbox_flow_sessions')
      .select('id, contact_id, flow_id, current_node_id, processing_started_at, status')
      .eq('processing', true)
      .lt('processing_started_at', fiveMinutesAgo);

    if (selectError) {
      console.error('[cleanup-stuck-sessions] Error selecting stuck sessions:', selectError);
      return new Response(JSON.stringify({ error: selectError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stuckCount = stuckSessions?.length || 0;
    console.log(`[cleanup-stuck-sessions] Found ${stuckCount} stuck sessions`);

    if (stuckCount === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No stuck sessions found',
        cleaned: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log each stuck session for debugging
    for (const session of stuckSessions || []) {
      const stuckDuration = Date.now() - new Date(session.processing_started_at).getTime();
      console.log(`[cleanup-stuck-sessions] Unlocking session ${session.id} - stuck for ${Math.round(stuckDuration / 1000 / 60)} minutes at node ${session.current_node_id}`);
    }

    // Unlock all stuck sessions
    const { error: updateError } = await supabaseClient
      .from('inbox_flow_sessions')
      .update({ 
        processing: false, 
        processing_started_at: null 
      })
      .eq('processing', true)
      .lt('processing_started_at', fiveMinutesAgo);

    if (updateError) {
      console.error('[cleanup-stuck-sessions] Error unlocking sessions:', updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[cleanup-stuck-sessions] Successfully unlocked ${stuckCount} sessions`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Unlocked ${stuckCount} stuck sessions`,
      cleaned: stuckCount,
      sessions: stuckSessions?.map(s => ({
        id: s.id,
        nodeId: s.current_node_id,
        stuckSince: s.processing_started_at
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[cleanup-stuck-sessions] Unexpected error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
