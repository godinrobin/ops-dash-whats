import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateUserAccess, forbiddenResponse, unauthorizedResponse } from "../_shared/validateAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

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

    const { imageUrl, imageName } = await req.json();

    if (!imageUrl) {
      throw new Error('Image URL is required');
    }

    console.log(`Analyzing image: ${imageName}`);

    // Use GPT-4 Vision to analyze the image
    const analysisPrompt = `Você é um especialista em marketing digital e análise de criativos para anúncios de WhatsApp e redes sociais.

Analise esta imagem de criativo publicitário e forneça uma avaliação detalhada em formato JSON.

Critérios de avaliação:

**HOOK (Gancho Visual) - 0 a 100:**
- A imagem captura atenção imediatamente?
- Há elementos visuais que param o scroll?
- As cores são impactantes?
- O texto principal é legível e chamativo?

**CORPO (Desenvolvimento Visual) - 0 a 100:**
- A mensagem é clara?
- Os elementos estão bem organizados?
- Há hierarquia visual correta?
- O produto/serviço está bem apresentado?

**CTA (Chamada para Ação) - 0 a 100:**
- O CTA está visível e claro?
- Há urgência ou escassez comunicada?
- O próximo passo está óbvio?
- Direciona para WhatsApp/contato de forma clara?

**COERÊNCIA - 0 a 100:**
- Todos os elementos se complementam?
- A mensagem geral é consistente?
- O tom visual combina com o público-alvo provável?
- Não há elementos conflitantes?

Responda APENAS com um JSON válido no seguinte formato:
{
  "hookScore": número de 0 a 100,
  "hookAnalysis": "análise detalhada do hook em 2-3 frases",
  "bodyScore": número de 0 a 100,
  "bodyAnalysis": "análise detalhada do corpo em 2-3 frases",
  "ctaScore": número de 0 a 100,
  "ctaAnalysis": "análise detalhada do CTA em 2-3 frases",
  "coherenceScore": número de 0 a 100,
  "coherenceAnalysis": "análise detalhada da coerência em 2-3 frases",
  "overallScore": média ponderada dos scores,
  "overallAnalysis": "resumo geral com principais pontos fortes e áreas de melhoria em 3-4 frases"
}`;

    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: analysisPrompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 2000,
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('OpenAI Vision error:', errorText);
      throw new Error('Failed to analyze image with AI');
    }

    const visionData = await visionResponse.json();
    const analysisText = visionData.choices[0]?.message?.content;

    if (!analysisText) {
      throw new Error('No analysis received from AI');
    }

    console.log('Raw analysis:', analysisText);

    // Parse JSON from response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Return default structure if parsing fails
      analysis = {
        hookScore: 50,
        hookAnalysis: "Não foi possível analisar o hook automaticamente.",
        bodyScore: 50,
        bodyAnalysis: "Não foi possível analisar o corpo automaticamente.",
        ctaScore: 50,
        ctaAnalysis: "Não foi possível analisar o CTA automaticamente.",
        coherenceScore: 50,
        coherenceAnalysis: "Não foi possível analisar a coerência automaticamente.",
        overallScore: 50,
        overallAnalysis: "A análise automática encontrou dificuldades. Por favor, tente novamente."
      };
    }

    console.log('Analysis complete:', analysis);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in analyze-creative-image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
