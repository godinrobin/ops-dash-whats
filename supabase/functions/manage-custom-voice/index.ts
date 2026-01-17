import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const MAX_CUSTOM_VOICES = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid token');
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const contentType = req.headers.get('content-type') || '';
    
    // Handle DELETE request
    if (req.method === 'DELETE') {
      const { voiceId } = await req.json();
      
      if (!voiceId) {
        throw new Error('voiceId is required');
      }

      console.log(`Deleting custom voice ${voiceId} for user ${user.id}`);

      // Delete from ElevenLabs
      const deleteResponse = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
        method: 'DELETE',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      });

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        console.error('ElevenLabs delete error:', deleteResponse.status, errorText);
        // Don't throw error if voice doesn't exist in ElevenLabs anymore
        if (deleteResponse.status !== 404) {
          throw new Error(`ElevenLabs API error: ${deleteResponse.status}`);
        }
      }

      // Delete from database
      const { error: dbError } = await supabaseClient
        .from('user_custom_voices')
        .delete()
        .eq('user_id', user.id)
        .eq('voice_id', voiceId);

      if (dbError) {
        console.error('Database delete error:', dbError);
        throw new Error('Failed to delete voice from database');
      }

      console.log('Voice deleted successfully');

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle POST request (create new voice)
    if (req.method === 'POST') {
      // Check if user has reached limit
      const { data: existingVoices, error: countError } = await supabaseClient
        .from('user_custom_voices')
        .select('id')
        .eq('user_id', user.id);

      if (countError) {
        throw new Error('Failed to check voice count');
      }

      if (existingVoices && existingVoices.length >= MAX_CUSTOM_VOICES) {
        throw new Error(`Você já atingiu o limite de ${MAX_CUSTOM_VOICES} vozes personalizadas. Delete uma voz existente para adicionar outra.`);
      }

      // Parse multipart form data
      const formData = await req.formData();
      const voiceName = formData.get('name') as string;
      const audioFile = formData.get('file') as File;

      if (!voiceName || !audioFile) {
        throw new Error('Voice name and audio file are required');
      }

      console.log(`Creating custom voice "${voiceName}" for user ${user.id}`);

      // Create FormData for ElevenLabs
      const elevenLabsFormData = new FormData();
      elevenLabsFormData.append('name', voiceName);
      elevenLabsFormData.append('files', audioFile, audioFile.name);
      elevenLabsFormData.append('description', `Custom voice created by user ${user.id}`);
      elevenLabsFormData.append('remove_background_noise', 'true');

      // Call ElevenLabs API to create voice
      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: elevenLabsFormData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API error:', response.status, errorText);
        
        // Parse error message
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.detail?.message) {
            throw new Error(errorJson.detail.message);
          }
        } catch {}
        
        throw new Error(`Erro ao criar voz no ElevenLabs: ${response.status}`);
      }

      const result = await response.json();
      console.log('ElevenLabs voice created:', result);

      // Save to database
      const { error: insertError } = await supabaseClient
        .from('user_custom_voices')
        .insert({
          user_id: user.id,
          voice_id: result.voice_id,
          voice_name: voiceName,
        });

      if (insertError) {
        console.error('Database insert error:', insertError);
        // Try to delete the voice from ElevenLabs since we couldn't save it
        await fetch(`https://api.elevenlabs.io/v1/voices/${result.voice_id}`, {
          method: 'DELETE',
          headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        });
        throw new Error('Failed to save voice to database');
      }

      console.log('Custom voice created successfully');

      return new Response(
        JSON.stringify({ 
          success: true, 
          voiceId: result.voice_id,
          voiceName: voiceName,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Method not allowed');
  } catch (error) {
    console.error('Error in manage-custom-voice function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
