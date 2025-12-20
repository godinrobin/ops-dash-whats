import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, videoUrl, subtitleConfig, requestId } = await req.json();

    const FAL_KEY = Deno.env.get('FAL_KEY');
    if (!FAL_KEY) {
      throw new Error('FAL_KEY not configured');
    }

    // Handle status check
    if (action === 'status') {
      if (!requestId) {
        throw new Error('requestId is required for status check');
      }

      console.log(`Checking subtitle status for request: ${requestId}`);

      const statusResponse = await fetch(
        `https://queue.fal.run/fal-ai/workflow-utilities/requests/${requestId}/status`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
          },
        }
      );

      // First get raw text to debug
      const statusText = await statusResponse.text();
      console.log('Raw status response:', statusText);

      // Try to parse as JSON
      let statusData;
      try {
        statusData = JSON.parse(statusText);
      } catch (e) {
        console.error('Failed to parse status response:', statusText);
        // If it's not JSON, return processing status
        return new Response(
          JSON.stringify({ status: 'processing' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Status response:', JSON.stringify(statusData));

      if (statusData.status === 'COMPLETED') {
        // Fetch the result
        const resultResponse = await fetch(
          `https://queue.fal.run/fal-ai/workflow-utilities/requests/${requestId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Key ${FAL_KEY}`,
            },
          }
        );

        const resultText = await resultResponse.text();
        console.log('Raw result response:', resultText);
        
        let resultData;
        try {
          resultData = JSON.parse(resultText);
        } catch (e) {
          console.error('Failed to parse result response:', resultText);
          throw new Error('Failed to parse subtitle result');
        }
        
        console.log('Result data:', JSON.stringify(resultData));

        // Check if there's an error in the completed result
        if (resultData.detail) {
          console.error('Fal.ai error in result:', resultData.detail);
          return new Response(
            JSON.stringify({ 
              status: 'failed', 
              error: typeof resultData.detail === 'string' 
                ? resultData.detail 
                : JSON.stringify(resultData.detail) 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const videoUrl = resultData.video?.url || resultData.output?.url;
        
        // If no video URL found, it's a failure
        if (!videoUrl) {
          console.error('No video URL in result:', JSON.stringify(resultData));
          return new Response(
            JSON.stringify({ 
              status: 'failed', 
              error: 'Video URL not found in result' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            status: 'done',
            videoUrl: videoUrl
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (statusData.status === 'FAILED') {
        return new Response(
          JSON.stringify({ status: 'failed', error: statusData.error }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ status: 'processing' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle subtitle request
    if (action === 'add-subtitles') {
      if (!videoUrl) {
        throw new Error('videoUrl is required');
      }

      console.log(`Adding subtitles to video: ${videoUrl}`);
      console.log('Subtitle config:', JSON.stringify(subtitleConfig));

      // Default config values
      const config = {
        font: subtitleConfig?.font || 'Montserrat/Montserrat-ExtraBold.ttf',
        font_size: subtitleConfig?.fontSize || 80,
        primary_color: subtitleConfig?.primaryColor || 'white',
        outline_color: subtitleConfig?.outlineColor || 'black',
        outline_width: subtitleConfig?.outlineWidth || 3,
        highlight_color: subtitleConfig?.highlightColor || 'yellow',
        word_level: subtitleConfig?.wordLevel !== false, // default true
        max_words_per_segment: subtitleConfig?.maxWordsPerSegment || 3,
        y_position: subtitleConfig?.yPosition || 70, // percentage from top
        language: subtitleConfig?.language || 'pt',
      };

      // Build the auto-subtitle request using Fal.ai's auto-subtitle API
      const falPayload = {
        video_url: videoUrl,
        font: config.font,
        font_size: config.font_size,
        primary_color: config.primary_color,
        outline_color: config.outline_color,
        outline_width: config.outline_width,
        highlight_current_word: true,
        highlight_color: config.highlight_color,
        max_words_per_segment: config.max_words_per_segment,
        word_level: config.word_level,
        y_position: config.y_position,
        language: config.language,
      };

      console.log('Submitting to Fal.ai auto-subtitle:', JSON.stringify(falPayload));

      // Submit to Fal.ai queue - correct endpoint is workflow-utilities/auto-subtitle
      const response = await fetch('https://queue.fal.run/fal-ai/workflow-utilities/auto-subtitle', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(falPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fal.ai error:', errorText);
        throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Fal.ai response:', JSON.stringify(data));

      return new Response(
        JSON.stringify({
          success: true,
          requestId: data.request_id,
          responseUrl: data.response_url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action. Use "add-subtitles" or "status"');

  } catch (error) {
    console.error('Error in add-subtitles-to-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
