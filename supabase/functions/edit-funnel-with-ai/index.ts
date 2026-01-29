import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateUserAccess, forbiddenResponse, unauthorizedResponse } from "../_shared/validateAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { funnelContent, editRequest, productContext } = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Editing funnel with AI. Request:', editRequest);

    const systemPrompt = `Você é um especialista em criar funis de vendas para WhatsApp. 
Você recebeu um funil já gerado e o usuário quer fazer alterações específicas.

REGRAS IMPORTANTES:
1. Mantenha a estrutura do funil (seções: Apresentação, Produto, Cobrança, Conclusão)
2. Faça APENAS as alterações solicitadas pelo usuário
3. Mantenha o tom e estilo do funil original
4. Preserve os tipos de mensagem (text, audio, image, video, ebook)
5. Para mensagens do tipo audio, video, image - mantenha apenas a instrução, não o content literal
6. Mantenha a mesma linguagem informal e persuasiva

Retorne o funil completo modificado no formato JSON exato:
{
  "sections": [
    {
      "title": "Nome da Seção",
      "concept": "Descrição do conceito",
      "messages": [
        {
          "type": "text|audio|image|video|ebook",
          "content": "Conteúdo da mensagem",
          "instruction": "Instrução para o usuário (opcional)"
        }
      ]
    }
  ]
}`;

    const userPrompt = `Contexto do produto: ${productContext || 'Não especificado'}

FUNIL ATUAL:
${JSON.stringify(funnelContent, null, 2)}

ALTERAÇÃO SOLICITADA PELO USUÁRIO:
${editRequest}

Por favor, faça a alteração solicitada e retorne o funil completo modificado em JSON.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse the JSON from the response
    let editedFunnel;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        editedFunnel = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing funnel JSON:', parseError);
      throw new Error('Erro ao processar resposta da IA');
    }

    console.log('Funnel edited successfully');

    return new Response(
      JSON.stringify({ funnel: editedFunnel }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in edit-funnel-with-ai function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
