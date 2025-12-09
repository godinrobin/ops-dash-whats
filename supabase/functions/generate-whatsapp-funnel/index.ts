import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { niche, product, expertName, angle, tickets, pixKey, pixName, siteUrl, bonus } = await req.json();

    console.log('Generating funnel for:', { niche, product, expertName, angle, tickets });

    const systemPrompt = `Você é um especialista em marketing digital e criação de funis de vendas para WhatsApp. Você cria funis de vendas altamente persuasivos e personalizados para infoprodutos.

IMPORTANTE: Você DEVE retornar APENAS um JSON válido, sem nenhum texto adicional antes ou depois.

O funil deve seguir esta estrutura obrigatória com 3 seções:

1. **APRESENTAÇÃO** - Onde apresentamos a expert e o produto de forma acolhedora
2. **PRODUTO** - Onde detalhamos o que o cliente vai receber e os benefícios
3. **COBRANÇA** - Onde fazemos a cobrança de forma empática e persuasiva

Cada mensagem deve ter um tipo:
- "text": Mensagens de texto normais
- "audio": Roteiro para áudio (escreva como se fosse uma transcrição)
- "image": Instrução para enviar imagem
- "video": Instrução para enviar vídeo
- "ebook": Instrução para enviar PDF/Ebook

Use muitos emojis de forma natural e acolhedora.
Personalize com o nome da expert, produto, nicho e ângulo informados.
O tom deve ser empático, acolhedor e persuasivo, nunca agressivo.

Retorne EXATAMENTE neste formato JSON:
{
  "sections": [
    {
      "title": "APRESENTAÇÃO",
      "concept": "Descrição breve do propósito desta seção",
      "messages": [
        {
          "type": "text",
          "content": "Conteúdo da mensagem"
        },
        {
          "type": "audio",
          "content": "Roteiro do áudio aqui..."
        }
      ]
    }
  ]
}

Para mensagens que são instruções (como "enviar vídeo mostrando o produto"), use:
{
  "type": "video",
  "content": "",
  "instruction": "Grave um vídeo de X segundos mostrando..."
}`;

    const userPrompt = `Crie um funil de WhatsApp completo para:

- **Nicho**: ${niche}
- **Produto**: ${product}
- **Nome da Expert**: ${expertName}
- **Ângulo de venda**: ${angle}
- **Ticket(s)**: ${tickets}
${pixKey ? `- **Chave Pix**: ${pixKey}` : ''}
${pixName ? `- **Nome no Pix**: ${pixName}` : ''}
${siteUrl ? `- **Site/URL do Produto**: ${siteUrl}` : ''}
${bonus ? `- **Bônus oferecido**: ${bonus}` : ''}

Crie o funil seguindo a estrutura de APRESENTAÇÃO, PRODUTO e COBRANÇA.

Na seção APRESENTAÇÃO:
- Primeira mensagem de texto acolhedora apresentando o conteúdo
- Um áudio de apresentação da expert (escreva o roteiro completo)

Na seção PRODUTO:
- Mensagens detalhando o que o cliente recebe
- Instrução para enviar vídeo mostrando o produto por dentro
- Instrução para enviar ebooks/materiais
- Se tiver site, incluir o link

Na seção COBRANÇA:
- Dados do Pix (se fornecidos)
- Mensagem empática de cobrança
- Áudio de cobrança mencionando o bônus (se houver)
- Mensagens de follow-up

${!pixKey ? 'Como não foi informada chave Pix, use "[SUA CHAVE PIX]" como placeholder.' : ''}
${!siteUrl ? 'Como não foi informado site, use "[SEU SITE]" como placeholder.' : ''}
${!bonus ? 'Não mencione bônus específicos, mas pode mencionar benefícios extras de forma genérica.' : ''}

Retorne APENAS o JSON válido, sem markdown, sem texto adicional.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error('Erro ao gerar funil com IA');
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    console.log('Raw AI response:', generatedContent);

    // Parse the JSON response
    let funnel;
    try {
      // Remove markdown code blocks if present
      let cleanContent = generatedContent.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
      }
      funnel = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.error('Content that failed to parse:', generatedContent);
      throw new Error('Erro ao processar resposta da IA');
    }

    return new Response(JSON.stringify({ funnel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in generate-whatsapp-funnel function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
