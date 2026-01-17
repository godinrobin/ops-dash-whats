import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const FAL_KEY = Deno.env.get('FAL_KEY');
const FAL_QUEUE_URL = 'https://queue.fal.run/fal-ai/sync-lipsync/v2';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client to verify user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { videoUrl, audioUrl, emotion, modelMode, lipsyncMode } = await req.json();

    if (!videoUrl || !audioUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Video URL and Audio URL are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!FAL_KEY) {
      console.error('FAL_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Lip sync service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[LipSync] Starting for user ${user.id}`);
    console.log(`[LipSync] Video: ${videoUrl}`);
    console.log(`[LipSync] Audio: ${audioUrl}`);
    console.log(`[LipSync] Settings: emotion=${emotion}, modelMode=${modelMode}, lipsyncMode=${lipsyncMode}`);

    // Queue the lip sync job with fal.ai v2
    // Uses lipsync-2 model (non-pro version)
    const falResponse = await fetch(FAL_QUEUE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_url: videoUrl,
        audio_url: audioUrl,
        model: 'lipsync-2',
        sync_mode: lipsyncMode || 'cut_off'
      }),
    });

    if (!falResponse.ok) {
      const errorText = await falResponse.text();
      console.error('[LipSync] Fal.ai error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Lip sync service error: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const falResult = await falResponse.json();
    console.log('[LipSync] Fal.ai response:', JSON.stringify(falResult));

    const requestId = falResult.request_id;
    const responseUrl = falResult.response_url;
    
    if (!requestId || !responseUrl) {
      console.error('[LipSync] No request_id or response_url in response');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to queue lip sync job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[LipSync] Job queued with request_id: ${requestId}`);
    console.log(`[LipSync] Response URL: ${responseUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        requestId,
        responseUrl  // Usar a URL retornada pela fal.ai
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[LipSync] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
