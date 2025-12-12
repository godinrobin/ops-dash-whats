import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAL_KEY = Deno.env.get('FAL_KEY');
// Using merge-videos API with video_urls array
const FAL_API_URL = 'https://queue.fal.run/fal-ai/ffmpeg-api/merge-videos';

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

    const { videoUrls, variationName } = await req.json();
    console.log(`Merging videos for variation: ${variationName}`, videoUrls);

    if (!FAL_KEY) {
      throw new Error('FAL_KEY not configured');
    }

    if (!videoUrls || videoUrls.length < 2) {
      throw new Error('At least 2 video URLs are required');
    }

    // Submit the job to Fal.ai merge-videos API
    // According to docs: video_urls is a list<string> of video URLs to merge in order
    const requestBody = {
      video_urls: videoUrls
    };
    
    console.log('Request body:', JSON.stringify(requestBody));

    const submitResponse = await fetch(FAL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await submitResponse.text();
    console.log('Fal.ai raw response:', responseText);

    if (!submitResponse.ok) {
      console.error('Fal.ai submit error:', responseText);
      throw new Error(`Fal.ai error: ${submitResponse.status} - ${responseText}`);
    }

    const submitResult = JSON.parse(responseText);
    console.log('Fal.ai submit result:', submitResult);

    const requestId = submitResult.request_id;
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
      responseUrl: submitResult.response_url,
      status: 'queued',
      variationName
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
