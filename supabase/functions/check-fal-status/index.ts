import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAL_KEY = Deno.env.get('FAL_KEY');
const FAL_MERGE_AUDIO_URL = 'https://queue.fal.run/fal-ai/ffmpeg-api/merge-audio-video';

// Retry fetch with exponential backoff for transient HTTP/2 errors
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`Fetch attempt ${attempt + 1} failed: ${lastError.message}`);
      
      // Only retry on connection/network errors
      if (lastError.message.includes('http2') || 
          lastError.message.includes('connection') || 
          lastError.message.includes('network') ||
          lastError.message.includes('SendRequest')) {
        const delay = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

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

    // First, check if the job exists and get its info
    const { data: jobData } = await supabaseClient
      .from('video_generation_jobs')
      .select('created_at, status, video_url')
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

      // Check if this is an audio merge job (video_url starts with audio_merge:)
      if (jobData.video_url?.startsWith('AUDIO_MERGE:')) {
        const audioMergeRequestId = jobData.video_url.replace('AUDIO_MERGE:', '');
        console.log(`Checking audio merge status: ${audioMergeRequestId}`);
        
        const audioFetchUrl = `https://queue.fal.run/fal-ai/ffmpeg-api/requests/${audioMergeRequestId}`;
        const audioResponse = await fetchWithRetry(audioFetchUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        console.log(`Audio merge response status: ${audioResponse.status}`);

        if (audioResponse.status === 202 || 
            (audioResponse.status === 400 && (await audioResponse.clone().text()).toLowerCase().includes('still in progress'))) {
          return new Response(JSON.stringify({ 
            success: true, 
            status: 'processing',
            videoUrl: null,
            requestId
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (audioResponse.ok) {
          const audioResult = await audioResponse.json();
          const finalVideoUrl = audioResult.video?.url || audioResult.video_url;
          
          if (finalVideoUrl) {
            console.log(`Audio merge complete: ${finalVideoUrl}`);
            await supabaseClient
              .from('video_generation_jobs')
              .update({ status: 'done', video_url: finalVideoUrl, updated_at: new Date().toISOString() })
              .eq('render_id', requestId)
              .eq('user_id', user.id);

            return new Response(JSON.stringify({ 
              success: true, 
              status: 'done',
              videoUrl: finalVideoUrl,
              requestId
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          status: 'processing',
          videoUrl: null,
          requestId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Use the response_url provided by Fal.ai
    const fetchUrl = responseUrl || `https://queue.fal.run/fal-ai/ffmpeg-api/requests/${requestId}`;
    
    console.log(`Fetching result from: ${fetchUrl}`);
    
    const resultResponse = await fetchWithRetry(fetchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Fal.ai response status: ${resultResponse.status}`);

    if (resultResponse.status === 202) {
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

    const videoUrl = resultData.video?.url || resultData.video_url || resultData.output?.url;
    
    if (videoUrl) {
      console.log(`Video URL found: ${videoUrl}`);
      
      // Check if this job needs audio merge
      if (jobData?.video_url?.startsWith('PENDING_AUDIO:')) {
        const audioUrl = jobData.video_url.replace('PENDING_AUDIO:', '');
        console.log(`Starting audio merge with: ${audioUrl}`);
        
        // Submit audio merge job
        const audioResponse = await fetchWithRetry(FAL_MERGE_AUDIO_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            video_url: videoUrl,
            audio_url: audioUrl,
            start_offset: 0
          })
        });

        if (audioResponse.ok) {
          const audioResult = await audioResponse.json();
          console.log(`Audio merge queued: ${audioResult.request_id}`);
          
          // Update job to track audio merge
          await supabaseClient
            .from('video_generation_jobs')
            .update({ 
              video_url: `AUDIO_MERGE:${audioResult.request_id}`,
              status: 'processing',
              updated_at: new Date().toISOString() 
            })
            .eq('render_id', requestId)
            .eq('user_id', user.id);

          return new Response(JSON.stringify({ 
            success: true, 
            status: 'processing',
            videoUrl: null,
            requestId
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          console.error('Failed to start audio merge');
        }
      }
      
      // No audio needed or audio merge failed, use video as-is
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
