import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAL_KEY = Deno.env.get('FAL_KEY');
const FAL_STATUS_URL = 'https://queue.fal.run/fal-ai/ffmpeg-api/concat-videos/requests';

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

    const { requestId } = await req.json();
    console.log(`Checking status for request: ${requestId}`);

    if (!FAL_KEY) {
      throw new Error('FAL_KEY not configured');
    }

    // Check job status
    const statusResponse = await fetch(`${FAL_STATUS_URL}/${requestId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('Fal.ai status error:', errorText);
      throw new Error(`Fal.ai error: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();
    console.log('Fal.ai status result:', statusResult);

    // Map Fal.ai status to our status
    let status = statusResult.status?.toLowerCase() || 'queued';
    let videoUrl = null;

    // If completed, fetch the result
    if (status === 'completed') {
      const resultResponse = await fetch(`${FAL_STATUS_URL}/${requestId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
        },
      });

      if (resultResponse.ok) {
        const resultData = await resultResponse.json();
        console.log('Fal.ai result:', resultData);
        videoUrl = resultData.video?.url || resultData.output?.url;
        status = 'done';

        // Update database
        if (videoUrl) {
          await supabaseClient
            .from('video_generation_jobs')
            .update({ status: 'done', video_url: videoUrl, updated_at: new Date().toISOString() })
            .eq('render_id', requestId)
            .eq('user_id', user.id);
        }
      }
    } else if (status === 'failed') {
      await supabaseClient
        .from('video_generation_jobs')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('render_id', requestId)
        .eq('user_id', user.id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      status,
      videoUrl,
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
