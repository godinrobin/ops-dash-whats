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
    const { referenceImageUrl, editInstructions } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!referenceImageUrl) {
      throw new Error('Imagem de referência é obrigatória');
    }

    console.log('Analyzing reference image and generating creative...');

    // Step 1: Analyze the reference image
    const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em análise de criativos para anúncios e marketing digital.
Analise a imagem fornecida e descreva em detalhes:
1. Estilo visual (cores, composição, layout)
2. Elementos principais (produto, texto, pessoas, objetos)
3. Tom e mood da imagem
4. Técnicas visuais utilizadas (gradientes, sombras, iluminação)
5. Público-alvo aparente

Responda em formato JSON:
{
  "style": "descrição do estilo",
  "elements": "descrição dos elementos",
  "mood": "descrição do tom/mood",
  "techniques": "técnicas visuais",
  "targetAudience": "público-alvo",
  "summary": "resumo completo em inglês para usar como prompt de geração de imagem"
}`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analise este criativo de referência:' },
              { type: 'image_url', image_url: { url: referenceImageUrl } }
            ]
          }
        ],
        max_tokens: 2000,
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error('Analysis error:', analysisResponse.status, errorText);
      throw new Error('Erro ao analisar imagem de referência');
    }

    const analysisData = await analysisResponse.json();
    const analysisText = analysisData.choices[0]?.message?.content;

    if (!analysisText) {
      throw new Error('Não foi possível analisar a imagem');
    }

    console.log('Analysis result:', analysisText);

    // Parse JSON from response
    let analysis;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        analysis = { summary: analysisText };
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      analysis = { summary: analysisText };
    }

    // Step 2: Generate new image based on analysis and user instructions
    let finalPrompt = analysis.summary || analysisText;
    
    if (editInstructions && editInstructions.trim()) {
      // Modify the prompt based on user instructions
      const modifyResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `Você é um especialista em criar prompts para geração de imagens de marketing.
Dado um prompt base e instruções de alteração, crie um novo prompt em inglês que incorpore as alterações solicitadas.
O prompt deve ser detalhado, específico e adequado para modelos de geração de imagem.
Responda APENAS com o novo prompt, sem explicações.`
            },
            {
              role: 'user',
              content: `Prompt base: ${finalPrompt}

Alterações solicitadas: ${editInstructions}

Crie um novo prompt em inglês incorporando essas alterações:`
            }
          ],
          temperature: 0.8,
        }),
      });

      if (modifyResponse.ok) {
        const modifyData = await modifyResponse.json();
        const modifiedPrompt = modifyData.choices[0]?.message?.content;
        if (modifiedPrompt) {
          finalPrompt = modifiedPrompt;
        }
      }
    }

    console.log('Final prompt for generation:', finalPrompt);

    // Step 3: Generate the new image using Gemini image generation
    const generateResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: `Generate a professional marketing creative image with the following characteristics: ${finalPrompt}. Make it high quality, visually appealing, and suitable for digital advertising. The image should be 1024x1024 pixels.`
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('Image generation error:', generateResponse.status, errorText);
      throw new Error('Erro ao gerar imagem');
    }

    const generateData = await generateResponse.json();
    const generatedImage = generateData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImage) {
      throw new Error('Não foi possível gerar a imagem');
    }

    console.log('Creative generated successfully from reference');

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        image: generatedImage,
        prompt: finalPrompt
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-from-reference function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
