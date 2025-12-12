import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAL_KEY = Deno.env.get('FAL_KEY');
const FAL_MERGE_VIDEOS_URL = 'https://queue.fal.run/fal-ai/ffmpeg-api/merge-videos';
const FAL_MERGE_AUDIO_URL = 'https://queue.fal.run/fal-ai/ffmpeg-api/merge-audio-video';

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
    console.log(`Video URLs: ${JSON.stringify(videoUrls)}`);
    console.log(`Audio URL: ${audioUrl || 'none'}`);

    if (!FAL_KEY) {
      throw new Error('FAL_KEY not configured');
    }

    if (!videoUrls || videoUrls.length < 2) {
      throw new Error('At least 2 video URLs are required');
    }

    let requestId: string;
    let responseUrl: string;

    if (audioUrl) {
      // With audio: First merge videos, wait for result, then add audio
      console.log('Processing with audio - Step 1: Merge videos');
      
      // Step 1: Merge videos (synchronous call to get immediate result)
      const mergeResponse = await fetch('https://fal.run/fal-ai/ffmpeg-api/merge-videos', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ video_urls: videoUrls })
      });

      if (!mergeResponse.ok) {
        const errorText = await mergeResponse.text();
        console.error('Fal.ai merge error:', errorText);
        throw new Error(`Video merge failed: ${mergeResponse.status}`);
      }

      const mergeResult = await mergeResponse.json();
      console.log('Video merge result:', JSON.stringify(mergeResult));

      const mergedVideoUrl = mergeResult.video?.url;
      if (!mergedVideoUrl) {
        throw new Error('No video URL returned from merge');
      }

      console.log('Step 2: Adding audio to merged video');
      
      // Step 2: Add audio to merged video (async/queued)
      const audioResponse = await fetch(FAL_MERGE_AUDIO_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: mergedVideoUrl,
          audio_url: audioUrl,
          start_offset: 0
        })
      });

      if (!audioResponse.ok) {
        const errorText = await audioResponse.text();
        console.error('Fal.ai audio merge error:', errorText);
        throw new Error(`Audio merge failed: ${audioResponse.status}`);
      }

      const audioResult = await audioResponse.json();
      console.log('Audio merge queued:', JSON.stringify(audioResult));

      requestId = audioResult.request_id;
      responseUrl = audioResult.response_url;

    } else {
      // Without audio: Just queue video merge
      console.log('Processing without audio - Queue video merge');
      
      const submitResponse = await fetch(FAL_MERGE_VIDEOS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ video_urls: videoUrls })
      });

      const responseText = await submitResponse.text();
      console.log('Fal.ai raw response:', responseText);

      if (!submitResponse.ok) {
        console.error('Fal.ai submit error:', responseText);
        throw new Error(`Fal.ai error: ${submitResponse.status} - ${responseText}`);
      }

      const submitResult = JSON.parse(responseText);
      console.log('Fal.ai submit result:', submitResult);

      requestId = submitResult.request_id;
      responseUrl = submitResult.response_url;
    }

    if (!requestId) {
      throw new Error('No request_id returned from Fal.ai');
    }

    // Save job to database
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
