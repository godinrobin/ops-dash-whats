import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateUserAccess, forbiddenResponse, unauthorizedResponse } from "../_shared/validateAccess.ts";

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

    const { videoUrl, videoName, checkExisting } = await req.json();
    console.log(`Analyzing creative: ${videoName}`);

    if (!videoUrl) {
      throw new Error('Video URL is required');
    }

    // Check for existing analysis if requested
    if (checkExisting) {
      const { data: existingAnalysis } = await supabaseClient
        .from('video_creative_analyses')
        .select('*')
        .eq('user_id', userId)
        .eq('video_url', videoUrl)
        .maybeSingle();

      if (existingAnalysis) {
        console.log('Found existing analysis');
        return new Response(JSON.stringify({
          success: true,
          cached: true,
          analysis: {
            hookScore: existingAnalysis.hook_score,
            bodyScore: existingAnalysis.body_score,
            ctaScore: existingAnalysis.cta_score,
            coherenceScore: existingAnalysis.coherence_score,
            overallScore: existingAnalysis.overall_score,
            hookAnalysis: existingAnalysis.hook_analysis,
            bodyAnalysis: existingAnalysis.body_analysis,
            ctaAnalysis: existingAnalysis.cta_analysis,
            coherenceAnalysis: existingAnalysis.coherence_analysis,
            overallAnalysis: existingAnalysis.overall_analysis,
            transcription: existingAnalysis.transcription,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
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
          coherenceScore: 0,
          hookAnalysis: 'Não foi possível identificar áudio no vídeo.',
          bodyAnalysis: 'Não foi possível identificar áudio no vídeo.',
          ctaAnalysis: 'Não foi possível identificar áudio no vídeo.',
          coherenceAnalysis: 'Não foi possível analisar coerência sem áudio.',
          overallAnalysis: 'O vídeo não possui áudio transcrevível. Certifique-se de que o vídeo contém narração ou diálogos.',
          transcription: '',
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 3: Analyze the creative with GPT
    console.log('Analyzing creative with GPT...');
    
    const analysisPrompt = `Você é um especialista sênior em análise de criativos de vídeo para vendas via WhatsApp. 
Analise a seguinte transcrição de um vídeo de anúncio e forneça uma análise justa e construtiva.

TRANSCRIÇÃO DO VÍDEO:
"${transcription}"

## ESTRUTURA DO VÍDEO
O vídeo é dividido em 3 partes:
1. HOOK (Início): Os primeiros segundos que devem chamar a atenção do usuário
2. CORPO (Meio): O conteúdo principal que deve reter o usuário e explicar a oferta
3. CTA (Final): A chamada para ação que deve direcionar para WhatsApp

## BASE DE CONHECIMENTO - O QUE FAZ UM BOM CRIATIVO

### HOOKS EFICAZES (nota 70-100):
- Perguntas retóricas que geram curiosidade ("Você sabia que...?", "Cansada de...?")
- Afirmações impactantes ou polêmicas (sem ser ofensivo)
- Identificação direta com a dor do público ("Se você sofre com...")
- Promessas intrigantes ("Descobri algo que mudou...")
- Uso de números específicos ("3 passos para...", "Em 7 dias...")
- Quebra de padrão (algo inesperado que prende atenção)

### CORPO EFICAZ (nota 70-100):
- Conta uma história ou jornada de transformação
- Apresenta provas sociais (depoimentos, resultados)
- Explica benefícios claros (não apenas características)
- Cria conexão emocional com o público
- Mantém ritmo e não é monótono
- Responde objeções de forma sutil

### CTA EFICAZ (nota 70-100):
- Chamada clara para o WhatsApp ("Clique no botão abaixo", "Me chama no WhatsApp")
- Urgência ou escassez genuína (quando aplicável)
- Benefício de tomar ação agora
- Simplicidade e clareza do próximo passo
- Reforço do que a pessoa vai receber

### COERÊNCIA (nota 70-100):
- Hook, corpo e CTA conversam entre si
- Não há mudanças bruscas de assunto
- A promessa do hook é entregue no corpo
- O CTA faz sentido com o que foi apresentado
- Tom de voz consistente ao longo do vídeo

## CRITÉRIOS DE AVALIAÇÃO JUSTOS
- Não penalize se o criativo for simples mas eficaz
- Valorize clareza e objetividade
- Considere que diferentes nichos têm abordagens diferentes
- Um criativo pode ser excelente mesmo sem usar TODAS as técnicas
- Seja construtivo: aponte o que está bom E o que pode melhorar
- Notas entre 60-85 são normais para criativos decentes
- Notas acima de 85 são para criativos excepcionais
- Notas abaixo de 50 apenas se houver problemas graves

Responda EXATAMENTE neste formato JSON (sem markdown, apenas o JSON puro):
{
  "hookScore": <número de 0 a 100>,
  "hookAnalysis": "<análise do hook em 2-3 frases, destacando pontos positivos e sugestões>",
  "bodyScore": <número de 0 a 100>,
  "bodyAnalysis": "<análise do corpo em 2-3 frases, destacando pontos positivos e sugestões>",
  "ctaScore": <número de 0 a 100>,
  "ctaAnalysis": "<análise do CTA em 2-3 frases, destacando pontos positivos e sugestões>",
  "coherenceScore": <número de 0 a 100>,
  "coherenceAnalysis": "<análise da coerência entre hook, corpo e CTA em 2-3 frases>",
  "overallScore": <número de 0 a 100>,
  "overallAnalysis": "<análise geral do criativo em 3-4 frases, incluindo principais pontos fortes e 1-2 sugestões prioritárias de melhoria>"
}`;

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um especialista sênior em marketing digital e análise de criativos de vídeo para vendas via WhatsApp. Seja justo e construtivo nas análises, reconhecendo pontos positivos e dando sugestões práticas. Sempre responda em JSON válido, sem markdown.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500,
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

    // Save analysis to database
    const { error: saveError } = await supabaseClient
      .from('video_creative_analyses')
      .insert({
        user_id: userId,
        video_url: videoUrl,
        video_name: videoName || 'Sem nome',
        hook_score: analysis.hookScore,
        body_score: analysis.bodyScore,
        cta_score: analysis.ctaScore,
        coherence_score: analysis.coherenceScore,
        overall_score: analysis.overallScore,
        hook_analysis: analysis.hookAnalysis,
        body_analysis: analysis.bodyAnalysis,
        cta_analysis: analysis.ctaAnalysis,
        coherence_analysis: analysis.coherenceAnalysis,
        overall_analysis: analysis.overallAnalysis,
        transcription: transcription,
      });

    if (saveError) {
      console.error('Failed to save analysis:', saveError);
      // Continue anyway, analysis was successful
    } else {
      console.log('Analysis saved to database');
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
