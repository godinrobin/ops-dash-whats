import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateUserAccess, forbiddenResponse, unauthorizedResponse } from "../_shared/validateAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAL_KEY = Deno.env.get('FAL_KEY');
const FAL_API_URL = 'https://queue.fal.run/fal-ai/ffmpeg-api/merge-audio-video';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate user access - requires member or admin
    const authHeader = req.headers.get('Authorization');
    const accessValidation = await validateUserAccess(authHeader, 'member');

    if (!accessValidation.isValid) {
      if (accessValidation.error === 'Missing or invalid authorization header' || 
          accessValidation.error === 'Invalid or expired token') {
        return unauthorizedResponse(accessValidation.error, corsHeaders);
      }
      return forbiddenResponse(accessValidation.error || 'Acesso negado. Plano premium necessário.', corsHeaders);
    }

    const userId = accessValidation.userId!;

    // Create Supabase client for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { videoUrl, audioUrl, variationName, startOffset = 0 } = await req.json();

    if (!videoUrl || !audioUrl) {
      throw new Error('Video URL and audio URL are required');
    }

    if (!FAL_KEY) {
      throw new Error('FAL_KEY is not configured');
    }

    console.log(`Adding audio to video: ${variationName}`);
    console.log(`Video URL: ${videoUrl}`);
    console.log(`Audio URL: ${audioUrl}`);
    console.log(`Start offset: ${startOffset}`);

    // Call Fal.ai merge audio video API
    const response = await fetch(FAL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_url: videoUrl,
        audio_url: audioUrl,
        start_offset: startOffset,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fal.ai API error:', response.status, errorText);
      throw new Error(`Fal.ai API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Fal.ai response:', JSON.stringify(data));

    // Store job in database
    const { error: dbError } = await supabaseClient
      .from('video_generation_jobs')
      .insert({
        user_id: userId,
        render_id: data.request_id,
        variation_name: variationName,
        status: 'processing',
      });

    if (dbError) {
      console.error('Database error:', dbError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        requestId: data.request_id,
        responseUrl: data.response_url 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in add-audio-to-video function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
