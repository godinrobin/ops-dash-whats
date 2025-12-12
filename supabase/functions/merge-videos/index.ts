import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAL_KEY = Deno.env.get('FAL_KEY');
const FAL_MERGE_VIDEOS_URL = 'https://queue.fal.run/fal-ai/ffmpeg-api/merge-videos';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { videoUrls, audioUrl, variationName } = await req.json();
    console.log(`Processing variation: ${variationName}`);
    console.log(`Video URLs count: ${videoUrls?.length}`);
    console.log(`Has audio: ${!!audioUrl}`);

    if (!FAL_KEY) {
      throw new Error('FAL_KEY not configured');
    }

    if (!videoUrls || videoUrls.length < 2) {
      throw new Error('At least 2 video URLs are required');
    }

    // ALWAYS use async queue for faster submission
    // Step 1: Queue video merge (async - returns immediately)
    console.log('Queuing video merge (async)...');
    
    const submitResponse = await fetch(FAL_MERGE_VIDEOS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_urls: videoUrls })
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error('Fal.ai submit error:', errorText);
      throw new Error(`Fal.ai error: ${submitResponse.status} - ${errorText}`);
    }

    const submitResult = await submitResponse.json();
    console.log('Fal.ai queued:', submitResult.request_id);

    const requestId = submitResult.request_id;
    const responseUrl = submitResult.response_url;

    if (!requestId) {
      throw new Error('No request_id returned from Fal.ai');
    }

    // Save job to database with audio info for later processing
    const { error: insertError } = await supabaseClient
      .from('video_generation_jobs')
      .insert({
        user_id: user.id,
        render_id: requestId,
        status: 'queued',
        variation_name: variationName
      });

    if (insertError) {
      console.error('Error inserting job:', insertError);
    }

    // Store audio URL in a way we can retrieve it later (using the job's render_id)
    // We'll handle audio merge in the status check function when video is ready
    if (audioUrl) {
      console.log('Audio URL will be merged when video is ready');
      // Store audio URL for later - we'll add it when checking status
      const { error: updateError } = await supabaseClient
        .from('video_generation_jobs')
        .update({ 
          video_url: `PENDING_AUDIO:${audioUrl}` // Temporary marker
        })
        .eq('render_id', requestId);
      
      if (updateError) {
        console.error('Error storing audio URL:', updateError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      requestId,
      responseUrl,
      status: 'queued',
      variationName,
      hasAudio: !!audioUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in merge-videos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
