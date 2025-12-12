import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SHOTSTACK_API_KEY = Deno.env.get('SHOTSTACK_API_KEY');
const SHOTSTACK_API_URL = 'https://api.shotstack.io/edit/v1';

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

    const { action, ...params } = await req.json();
    console.log(`Action: ${action}`, params);

    if (action === 'render') {
      const { variations, hookVideos, bodyVideos, ctaVideos } = params;

      if (!SHOTSTACK_API_KEY) {
        throw new Error('SHOTSTACK_API_KEY not configured');
      }

      const renderResults = [];

      for (const variation of variations) {
        const { hookIndex, bodyIndex, ctaIndex, name } = variation;
        
        const hookUrl = hookVideos[hookIndex];
        const bodyUrl = bodyVideos[bodyIndex];
        const ctaUrl = ctaVideos[ctaIndex];

        // Create timeline with clips in sequence on a single track
        const timeline = {
          tracks: [
            {
              clips: [
                {
                  asset: {
                    type: "video",
                    src: hookUrl
                  },
                  start: 0,
                  length: "auto"
                },
                {
                  asset: {
                    type: "video",
                    src: bodyUrl
                  },
                  start: "auto",
                  length: "auto"
                },
                {
                  asset: {
                    type: "video",
                    src: ctaUrl
                  },
                  start: "auto",
                  length: "auto"
                }
              ]
            }
          ]
        };

        const edit = {
          timeline,
          output: {
            format: "mp4",
            resolution: "hd"
          }
        };

        console.log(`Rendering variation ${name}:`, JSON.stringify(edit));

        const response = await fetch(`${SHOTSTACK_API_URL}/render`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': SHOTSTACK_API_KEY
          },
          body: JSON.stringify(edit)
        });

        const result = await response.json();
        console.log(`Render response for ${name}:`, result);

        if (result.success && result.response?.id) {
          // Save job to database
          const { error: insertError } = await supabaseClient
            .from('video_generation_jobs')
            .insert({
              user_id: user.id,
              render_id: result.response.id,
              status: 'queued',
              variation_name: name
            });

          if (insertError) {
            console.error('Error inserting job:', insertError);
          }

          renderResults.push({
            name,
            renderId: result.response.id,
            status: 'queued'
          });
        } else {
          console.error(`Failed to queue render for ${name}:`, result);
          renderResults.push({
            name,
            error: result.message || 'Failed to queue render',
            status: 'failed'
          });
        }
      }

      return new Response(JSON.stringify({ success: true, renders: renderResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'status') {
      const { renderId } = params;

      if (!SHOTSTACK_API_KEY) {
        throw new Error('SHOTSTACK_API_KEY not configured');
      }

      const response = await fetch(`${SHOTSTACK_API_URL}/render/${renderId}`, {
        method: 'GET',
        headers: {
          'x-api-key': SHOTSTACK_API_KEY
        }
      });

      const result = await response.json();
      console.log(`Status for ${renderId}:`, result);

      if (result.success && result.response) {
        const { status, url } = result.response;

        // Update database if done
        if (status === 'done' && url) {
          await supabaseClient
            .from('video_generation_jobs')
            .update({ status: 'done', video_url: url, updated_at: new Date().toISOString() })
            .eq('render_id', renderId)
            .eq('user_id', user.id);
        } else if (status === 'failed') {
          await supabaseClient
            .from('video_generation_jobs')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('render_id', renderId)
            .eq('user_id', user.id);
        }

        return new Response(JSON.stringify({ 
          success: true, 
          status, 
          url,
          renderId 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: result.message || 'Failed to get status' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error in generate-video-variations:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
