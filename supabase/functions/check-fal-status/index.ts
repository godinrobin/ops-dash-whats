import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAL_KEY = Deno.env.get('FAL_KEY');

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

    const { requestId, responseUrl } = await req.json();
    console.log(`Checking status for request: ${requestId}`);

    if (!FAL_KEY) {
      throw new Error('FAL_KEY not configured');
    }

    // First, check if the job exists and get its creation time
    const { data: jobData } = await supabaseClient
      .from('video_generation_jobs')
      .select('created_at, status')
      .eq('render_id', requestId)
      .eq('user_id', user.id)
      .single();

    // If job is older than 1 hour and still queued, mark as expired/failed
    if (jobData) {
      const createdAt = new Date(jobData.created_at);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      if (createdAt < hourAgo && (jobData.status === 'queued' || jobData.status === 'processing')) {
        console.log(`Job ${requestId} expired (created at ${createdAt.toISOString()})`);
        await supabaseClient
          .from('video_generation_jobs')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('render_id', requestId)
          .eq('user_id', user.id);
        
        return new Response(JSON.stringify({ 
          success: true, 
          status: 'failed',
          videoUrl: null,
          requestId,
          reason: 'expired'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Use the response_url provided by Fal.ai - it's the correct endpoint
    // Note: Fal.ai returns response_url as fal-ai/ffmpeg-api/requests/{id} (without merge-videos in path)
    const fetchUrl = responseUrl || `https://queue.fal.run/fal-ai/ffmpeg-api/requests/${requestId}`;
    
    console.log(`Fetching result from: ${fetchUrl}`);
    
    const resultResponse = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Fal.ai response status: ${resultResponse.status}`);

    if (resultResponse.status === 202) {
      // Still processing
      console.log('Job still processing (202)');
      return new Response(JSON.stringify({ 
        success: true, 
        status: 'processing',
        videoUrl: null,
        requestId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      console.error('Fal.ai error:', errorText);
      
      // Check if it's a "still in progress" error (400 with specific message)
      if (resultResponse.status === 400 && errorText.toLowerCase().includes('still in progress')) {
        console.log('Job still in progress (400 response)');
        return new Response(JSON.stringify({ 
          success: true, 
          status: 'processing',
          videoUrl: null,
          requestId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Mark as failed in database
      await supabaseClient
        .from('video_generation_jobs')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('render_id', requestId)
        .eq('user_id', user.id);
      
      return new Response(JSON.stringify({ 
        success: true, 
        status: 'failed',
        videoUrl: null,
        requestId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resultData = await resultResponse.json();
    console.log('Fal.ai result:', JSON.stringify(resultData));

    // Check if we have a video URL in the result
    // merge-videos API returns video.url according to docs
    const videoUrl = resultData.video?.url || resultData.video_url || resultData.output?.url || resultData.data?.video?.url;
    
    if (videoUrl) {
      // Job completed successfully
      console.log(`Video URL found: ${videoUrl}`);
      await supabaseClient
        .from('video_generation_jobs')
        .update({ status: 'done', video_url: videoUrl, updated_at: new Date().toISOString() })
        .eq('render_id', requestId)
        .eq('user_id', user.id);

      return new Response(JSON.stringify({ 
        success: true, 
        status: 'done',
        videoUrl,
        requestId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // If no video URL but response is OK, check if still in queue
    if (resultData.status === 'IN_QUEUE' || resultData.status === 'IN_PROGRESS') {
      console.log(`Job status: ${resultData.status}`);
      return new Response(JSON.stringify({ 
        success: true, 
        status: 'processing',
        videoUrl: null,
        requestId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Default: still processing
    console.log('No video URL yet, still processing');
    return new Response(JSON.stringify({ 
      success: true, 
      status: 'processing',
      videoUrl: null,
      requestId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in check-fal-status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
