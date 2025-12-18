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
    const { niche, product, expertName, angle, tickets, tone, pegada, pixKey, pixName, pixBank, pixKeyType, siteUrl, bonus, ebookContent } = await req.json();

    console.log('Generating funnel for:', { niche, product, expertName, angle, tickets, tone, pegada, pixName, pixBank, pixKeyType });

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

    // Define tone descriptions
    const toneDescriptions: Record<string, string> = {
      informal: "Informal e amigável - use gírias leves, seja próximo e descontraído, como uma conversa entre amigos",
      formal: "Formal e profissional - mantenha educação, respeito e profissionalismo, mas sem ser frio",
      descontraido: "Descontraído e animado - use humor leve, emojis com mais frequência, seja muito entusiasmado",
      leve: "Leve e suave - seja gentil, calmo e acolhedor, como um abraço aconchegante",
    };

    const toneInstruction = toneDescriptions[tone || 'informal'] || toneDescriptions.informal;

    // Define pegada (approach) descriptions
    const pegadaDescriptions: Record<string, string> = {
      white: "Copy equilibrada e natural - use técnicas de persuasão éticas, promessas realistas e linguagem honesta. Foque em benefícios reais do produto.",
      black: `Copy AGRESSIVA de vendas - você DEVE:
        - Usar gatilhos mentais fortes de URGÊNCIA ("vagas limitadas", "última chance", "só hoje")
        - Usar gatilhos de ESCASSEZ ("apenas X unidades", "estou fechando as vendas")
        - Usar gatilhos de PROVA SOCIAL ("centenas de pessoas já transformaram", "resultados comprovados")
        - Fazer PROMESSAS MAIS FORTES e impactantes (mas ainda plausíveis)
        - PRESSIONAR nas mensagens de cobrança ("estou aguardando", "não me deixe na mão")
        - Usar gatilhos emocionais ("imagine você daqui 30 dias", "sua família merece")
        - Criar senso de OPORTUNIDADE ÚNICA
        IMPORTANTE: Seja agressivo nas vendas, pressione o lead, mas sem desrespeitar.`,
      "muito-black": `Copy EXTREMAMENTE agressiva - seja o MAIS PERSUASIVO e AGRESSIVO possível para CONVERTER.
        
        IMPORTANTE: Seja CRIATIVO e VARIADO - NÃO use sempre os mesmos gatilhos. INVENTE novos mecanismos de persuasão agressiva para cada funil ser ÚNICO.
        
        EXEMPLOS de níveis de agressividade (use como INSPIRAÇÃO, mas CRIE NOVOS e DIFERENTES a cada funil):
        - Gatilhos religiosos/espirituais ("Deus colocou você aqui", "isso é um sinal divino")
        - Gatilhos familiares ("sua família precisa disso", "filhos passando necessidade")
        - Gatilhos de culpa ("não desperdice essa chance", "não me decepcione", "confiei em você")
        - Gatilhos de medo de perda ("você vai se arrepender", "essa é sua ÚLTIMA oportunidade de verdade")
        - Gatilhos de autoridade ("especialistas comprovam", "método validado por milhares")
        - Gatilhos de reciprocidade ("estou te dando de presente", "fiz isso especialmente por você")
        - Pressão direta na cobrança ("estou aguardando", "separei um tempo pra você", "não me deixe na mão")
        - Escassez extrema ("só restam 2 vagas", "vou fechar AGORA")
        - Histórias emocionais pessoais que geram conexão profunda
        - Promessas de transformação radical de vida
        
        REGRA CRÍTICA: Cada funil deve ter uma ABORDAGEM ÚNICA. Use sua CRIATIVIDADE para criar gatilhos NOVOS e DIFERENTES. Surpreenda. Seja IMPREVISÍVEL na forma de pressionar. NÃO repita padrões.
        
        O objetivo é CONVERTER usando TODOS os artifícios possíveis, mas SEM DESRESPEITAR a pessoa.`,
    };

    const pegadaInstruction = pegadaDescriptions[pegada || 'white'] || pegadaDescriptions.white;

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
1. Use emojis de forma MODERADA apenas em mensagens de TEXTO - NÃO use emojis em roteiros de áudio.
2. Emojis permitidos em texto: ✨ 💕 🎁 ✅ 💰 🔥 ⚠️ (use com moderação, 1-2 por mensagem no máximo)
3. Personalize com o nome da expert, produto, nicho e ângulo informados.
4. O TOM DEVE SER: ${toneInstruction}
5. A PEGADA/ABORDAGEM DEVE SER: ${pegadaInstruction}
6. O tom deve ser PESSOAL - lembre-se que é uma conversa de WhatsApp individual, não um broadcast para várias pessoas. Trate como se fosse uma conversa única com UMA pessoa.
7. NUNCA fale como se estivesse falando com várias pessoas (evite "vocês", "pessoal", "galera").
8. Use linguagem acolhedora e próxima: "você", "meu amor", "querida", etc.
9. NÃO repita saudações como "Olá" ou "Oi" em todos os áudios - varie a abordagem.
10. ROTEIROS DE ÁUDIO devem ser texto puro, sem emojis, escritos como fala natural.

REGRAS PARA SEÇÃO PRODUTO:
- Ao listar os entregáveis/conteúdos do produto, use SEMPRE o emoji ✅ (check) no início de cada item
- NÃO use setas (➡️) para listar itens
- Exemplo de formatação correta:
  "Com ele, você terá acesso à:
  
  ✅ Guia completo
  ✅ Tutoriais passo a passo
  ✅ Lista de materiais
  ✅ Certificado Digital
  
  🎁 + Bônus especiais"
- Use ✅ também para listar os bônus

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

INSTRUÇÕES CRÍTICAS DE TOM E PEGADA:
1. UTILIZE O TOM: ${toneInstruction}
2. UTILIZE A PEGADA: ${pegadaInstruction}
${pegada === 'muito-black' ? `
ATENÇÃO - PEGADA MUITO BLACK SELECIONADA:
- Seja EXTREMAMENTE agressivo e CRIATIVO nas mensagens
- CRIE gatilhos emocionais NOVOS e ÚNICOS para este funil - NÃO repita padrões
- Na APRESENTAÇÃO: crie urgência desde o início, use gatilhos criativos de conexão emocional
- No PRODUTO: exagere os benefícios, prometa transformações radicais de vida
- Na COBRANÇA: invente novos artifícios emocionais - seja criativo, surpreenda, pressione de formas diferentes
- Use TODOS os mecanismos de conversão possíveis
- IMPORTANTE: Cada funil deve ser ÚNICO - não use sempre os mesmos gatilhos (religioso, filha, etc.)
- Seja IMPREVISÍVEL na abordagem agressiva
- Lembre-se: ser agressivo mas SEM desrespeitar a pessoa
` : ''}
${pegada === 'black' ? `
ATENÇÃO - PEGADA BLACK SELECIONADA:
- Seja AGRESSIVO nas vendas, pressione o lead
- Use gatilhos de URGÊNCIA em todas as seções ("vagas limitadas", "última chance", "só hoje")
- Use gatilhos de ESCASSEZ ("apenas X unidades", "estou fechando")
- Use PROVA SOCIAL ("centenas já transformaram suas vidas")
- PRESSIONE nas mensagens de cobrança ("estou aguardando seu pix", "não me deixe na mão", "confiei em você")
- Use gatilhos emocionais fortes ("imagine sua família", "você merece isso")
- Crie senso de OPORTUNIDADE ÚNICA em cada mensagem
- Lembre-se: ser agressivo mas SEM desrespeitar a pessoa
` : ''}

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