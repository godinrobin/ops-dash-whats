import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentImageUrl, editRequest, productName, modelType } = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Editing creative with AI. Request:', editRequest);

    // First, generate a new prompt based on the edit request
    const promptGenerationResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `Você é um especialista em criar prompts para geração de imagens de marketing/publicidade.
O usuário tem uma imagem de criativo atual e quer fazer uma alteração.
Crie um prompt detalhado em inglês para gerar uma nova imagem que incorpore a alteração solicitada.
O prompt deve ser específico, visual e adequado para um modelo de geração de imagem.
Mantenha o estilo profissional de anúncio/criativo.
Responda APENAS com o prompt, sem explicações adicionais.` 
          },
          { 
            role: 'user', 
            content: `Produto: ${productName}
Tipo de modelo: ${modelType}
Alteração solicitada: ${editRequest}

Crie um prompt em inglês para gerar uma nova imagem de criativo que incorpore essa alteração.` 
          }
        ],
        temperature: 0.8,
      }),
    });

    if (!promptGenerationResponse.ok) {
      throw new Error('Erro ao gerar prompt');
    }

    const promptData = await promptGenerationResponse.json();
    const newPrompt = promptData.choices[0].message.content;

    console.log('Generated prompt:', newPrompt);

    // Now generate the new image using DALL-E
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: newPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd',
        response_format: 'url',
      }),
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('DALL-E API error:', imageResponse.status, errorText);
      throw new Error(`Erro ao gerar imagem: ${imageResponse.status}`);
    }

    const imageData = await imageResponse.json();
    const newImageUrl = imageData.data[0].url;

    console.log('Creative edited successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        image: newImageUrl,
        prompt: newPrompt 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in edit-creative-with-ai function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
