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
    const { niche, product, expertName, angle, tickets, pixKey, pixName, pixBank, pixKeyType, siteUrl, bonus, ebookContent } = await req.json();

    console.log('Generating funnel for:', { niche, product, expertName, angle, tickets, pixName, pixBank, pixKeyType });

    // Check if niche is religious
    const isReligiousNiche = niche?.toLowerCase().includes('religi') || 
                            niche?.toLowerCase().includes('bíbli') || 
                            niche?.toLowerCase().includes('bibli') ||
                            niche?.toLowerCase().includes('cristã') ||
                            niche?.toLowerCase().includes('evangél') ||
                            product?.toLowerCase().includes('bíbli') ||
                            product?.toLowerCase().includes('bibli') ||
                            product?.toLowerCase().includes('devocional');

    // Parse multiple tickets
    const ticketValues = tickets?.split(/[,+]/).map((t: string) => t.trim()).filter((t: string) => t) || [];
    const hasMultipleTickets = ticketValues.length > 1;

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

REGRAS CRÍTICAS:
1. Use emojis de forma natural e acolhedora.
2. Personalize com o nome da expert, produto, nicho e ângulo informados.
3. O tom deve ser PESSOAL e INFORMAL - lembre-se que é uma conversa de WhatsApp individual, não um broadcast para várias pessoas. Trate como se fosse uma conversa única com UMA pessoa.
4. NUNCA fale como se estivesse falando com várias pessoas (evite "vocês", "pessoal", "galera").
5. Use linguagem acolhedora e próxima: "você", "meu amor", "querida", etc.
6. NÃO repita saudações como "Olá" ou "Oi" em todos os áudios - varie a abordagem.

REGRAS ESPECIAIS PARA CHAVE PIX:
- Na seção COBRANÇA, primeiro envie uma mensagem com os dados completos do pagamento incluindo:
  * Valor do produto
  * Chave Pix
  * Nome que aparece no Pix
  * Banco (se informado)
  * Tipo de chave (se informado)
- Depois adicione uma mensagem separada dizendo "Copie a chave pix abaixo:" 
- E em seguida, uma mensagem SEPARADA contendo SOMENTE a chave pix (sem texto adicional, exatamente como foi informada, sem formatação)

REGRAS PARA NOME DO PIX:
${isReligiousNiche ? `- Se o nome do PIX for diferente do gênero da expert, diga que é de "alguém da equipe que ajuda no projeto"` : `- Se o nome do PIX parecer ser masculino e a expert for feminina, adicione uma mensagem explicando que é do marido/esposo que ajuda ela no negócio
- Se o nome do PIX parecer ser feminino e o expert for masculino, adicione uma mensagem explicando que é da esposa que ajuda ele no negócio`}
- Se o nome do PIX parecer ser de empresa (contém LTDA, MEI, DIGITAL, etc), adicione uma mensagem explicando que é da empresa
- Se o nome do PIX for do mesmo gênero da expert, não precisa explicar nada

REGRAS PARA MÚLTIPLOS VALORES:
${hasMultipleTickets ? `- O produto tem múltiplos valores: ${ticketValues.join(', ')}. Na cobrança, crie uma copy dizendo que o cliente pode ajudar o trabalho com ${ticketValues[0]} (valor inicial), mas caso toque no coração, pode ajudar também com os demais valores (${ticketValues.slice(1).join(', ')}).` : ''}

REGRAS PARA SITE:
- Se NÃO foi informado site/URL, NÃO inclua mensagens sobre site no funil
- Se foi informado site, inclua normalmente

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
${pixKey ? `- **Chave Pix**: ${pixKey} (mantenha exatamente como está, sem formatar)` : ''}
${pixKeyType ? `- **Tipo de Chave Pix**: ${pixKeyType}` : ''}
${pixName ? `- **Nome no Pix**: ${pixName}` : ''}
${pixBank ? `- **Banco do Pix**: ${pixBank}` : ''}
${siteUrl ? `- **Site/URL do Produto**: ${siteUrl}` : '- **Site/URL do Produto**: NÃO INFORMADO (não incluir mensagens sobre site)'}
${bonus ? `- **Bônus oferecido**: ${bonus}` : ''}
${ebookContent ? `- **Conteúdo do E-book/Material**: ${ebookContent}` : ''}

LEMBRE-SE: É uma conversa de WhatsApp individual, 1 para 1. Não fale como se fosse para várias pessoas.

Crie o funil seguindo a estrutura de APRESENTAÇÃO, PRODUTO e COBRANÇA.

Na seção APRESENTAÇÃO:
- Primeira mensagem de texto acolhedora apresentando o conteúdo (sem falar "vocês" ou "pessoal")
- Um áudio de apresentação da expert (escreva o roteiro completo, começando de forma diferente, sem "Olá" ou "Oi")

Na seção PRODUTO:
- Mensagens detalhando o que o cliente recebe${ebookContent ? ` (use as informações do conteúdo: ${ebookContent})` : ''}
- Instrução para enviar vídeo mostrando o produto por dentro
- Instrução para enviar ebooks/materiais
${siteUrl ? `- Incluir o link do site: ${siteUrl}` : '- NÃO incluir mensagens sobre site pois não foi informado'}

Na seção COBRANÇA:
${pixKey ? `- Mensagem com dados do Pix (chave: ${pixKey}, nome: ${pixName || 'não informado'}${pixBank ? `, banco: ${pixBank}` : ''}${pixKeyType ? `, tipo: ${pixKeyType}` : ''})` : '- Use "[SUA CHAVE PIX]" como placeholder para a chave'}
${pixName ? `- Analise se precisa explicar sobre o nome (${pixName}) vs expert (${expertName})${isReligiousNiche ? ' - Se diferente, diga que é de alguém da equipe' : ''}` : ''}
- IMPORTANTE: Após enviar os dados do pix, adicione uma mensagem separada dizendo "Copie a chave pix abaixo:" 
- E uma nova mensagem contendo SOMENTE a chave pix (${pixKey || '[SUA CHAVE PIX]'})
${hasMultipleTickets ? `- Mencione que o valor inicial é ${ticketValues[0]}, mas se tocar no coração, pode ajudar com ${ticketValues.slice(1).join(' ou ')} também` : ''}
- Mensagem empática de cobrança (pessoal, falando com UMA pessoa)
- Áudio de cobrança${bonus ? ` mencionando o bônus: ${bonus}` : ''} (comece diferente, sem "Olá" ou "Oi")
- Mensagens de follow-up

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