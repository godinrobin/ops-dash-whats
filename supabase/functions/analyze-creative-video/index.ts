import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

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

    const { videoUrl, videoName } = await req.json();
    console.log(`Analyzing creative: ${videoName}`);

    if (!videoUrl) {
      throw new Error('Video URL is required');
    }

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Step 1: Download the video and extract audio
    console.log('Downloading video...');
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error('Failed to download video');
    }
    const videoBuffer = await videoResponse.arrayBuffer();
    console.log(`Video downloaded, size: ${videoBuffer.byteLength} bytes`);

    // Step 2: Transcribe audio using ElevenLabs
    console.log('Transcribing audio with ElevenLabs...');
    
    const formData = new FormData();
    formData.append('file', new Blob([videoBuffer], { type: 'video/mp4' }), 'video.mp4');
    formData.append('model_id', 'scribe_v1');
    formData.append('language_code', 'por');
    formData.append('tag_audio_events', 'false');
    formData.append('diarize', 'false');

    const transcriptionResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error('ElevenLabs transcription error:', errorText);
      throw new Error(`Failed to transcribe audio: ${errorText}`);
    }

    const transcriptionData = await transcriptionResponse.json();
    const transcription = transcriptionData.text || '';
    console.log('Transcription:', transcription);

    if (!transcription || transcription.trim() === '') {
      return new Response(JSON.stringify({
        success: true,
        analysis: {
          overallScore: 0,
          hookScore: 0,
          bodyScore: 0,
          ctaScore: 0,
          hookAnalysis: 'Não foi possível identificar áudio no vídeo.',
          bodyAnalysis: 'Não foi possível identificar áudio no vídeo.',
          ctaAnalysis: 'Não foi possível identificar áudio no vídeo.',
          overallAnalysis: 'O vídeo não possui áudio transcrevível. Certifique-se de que o vídeo contém narração ou diálogos.',
          transcription: '',
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 3: Analyze the creative with GPT
    console.log('Analyzing creative with GPT...');
    
    const analysisPrompt = `Você é um especialista em análise de criativos de vídeo para anúncios de WhatsApp. 
Analise a seguinte transcrição de um vídeo de anúncio e forneça uma análise detalhada.

TRANSCRIÇÃO DO VÍDEO:
"${transcription}"

O vídeo é dividido em 3 partes:
1. HOOK (Início): Os primeiros segundos que devem chamar a atenção do usuário
2. CORPO (Meio): O conteúdo principal que deve reter o usuário e explicar a oferta
3. CTA (Final): A chamada para ação que deve direcionar para WhatsApp

Analise cada parte separadamente e o vídeo como um todo. Dê uma nota de 0 a 100 para cada parte e uma nota geral.

Responda EXATAMENTE neste formato JSON (sem markdown, apenas o JSON puro):
{
  "hookScore": <número de 0 a 100>,
  "hookAnalysis": "<análise do hook em 2-3 frases>",
  "bodyScore": <número de 0 a 100>,
  "bodyAnalysis": "<análise do corpo em 2-3 frases>",
  "ctaScore": <número de 0 a 100>,
  "ctaAnalysis": "<análise do CTA em 2-3 frases>",
  "overallScore": <número de 0 a 100>,
  "overallAnalysis": "<análise geral do criativo em 3-4 frases, incluindo pontos fortes e sugestões de melhoria>"
}

Critérios de avaliação:
- Hook: Consegue capturar atenção nos primeiros segundos? Gera curiosidade?
- Corpo: Mantém o interesse? Explica bem a oferta? É persuasivo?
- CTA: É claro e direto? Motiva a ação de chamar no WhatsApp?
- Geral: Fluidez, coerência, persuasão e adequação para vendas via WhatsApp`;

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um especialista em marketing digital e análise de criativos de vídeo. Sempre responda em JSON válido, sem markdown.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!gptResponse.ok) {
      const errorText = await gptResponse.text();
      console.error('OpenAI error:', errorText);
      throw new Error(`Failed to analyze creative: ${errorText}`);
    }

    const gptData = await gptResponse.json();
    const analysisText = gptData.choices[0].message.content;
    console.log('GPT Analysis:', analysisText);

    // Parse the JSON response
    let analysis;
    try {
      // Clean up the response in case it has markdown code blocks
      const cleanedText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse GPT response:', parseError);
      throw new Error('Failed to parse analysis response');
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: {
        ...analysis,
        transcription,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in analyze-creative-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
