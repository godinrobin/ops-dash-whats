import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KNOWLEDGE_BASE = `
Você é um especialista em criar copys para criativos de vídeo para ofertas de WhatsApp. 
Sua tarefa é criar uma copy de áudio para um criativo de vídeo baseado no produto informado pelo usuário.

## Estilo de Copy

A copy deve seguir o estilo dos exemplos abaixo, que são copys validadas de criativos de sucesso:

### Exemplo 1 - Lembrancinha Religiosa:
"Sabe aquelas lembrancinhas de casamento que são bonitas, mas acabam esquecidas depois da festa? Então, essa é completamente diferente. Eu quis criar algo que tivesse significado de verdade, algo que levasse a presença de Deus pra cada convidado. Peguei potinhos de vidro simples, desses que a gente tem em casa mesmo, e dentro de cada um coloquei 365 versículos da Bíblia. Cada convidado leva pra casa um pote da Palavra de Deus com mensagens de fé pra o ano inteiro. Um presente que não enfeita apenas uma prateleira, mas alimenta a alma e o coração de quem recebe. Com o PDF que eu vou te enviar, você recebe todos os 365 versículos prontos e moldes lindos pra imprimir e montar. Você só precisa dos potinhos e vontade de abençoar. Me chama no WhatsApp e garanta o seu material por um valor simbólico de 10 reais. Transforme sua lembrancinha em algo que vai ecoar na fé de cada convidado."

### Exemplo 2 - Receita/Emagrecimento:
"Essa receita secreta me fez parar de beliscar besteira à noite, e o que você não imagina? É uma salada, mas tão cremosa, saborosa e leve que parece sobremesa sem exagero. Durante anos minha rotina era assim, jantar leve, e umas horas depois só um chocolatinho, só uma bolacha. Resultado? Inchaço, peso travado e culpa. Até que descobri uma coleção de receitas de saladas gourmet que mudou a minha rotina. Agora minhas refeições são tão gostosas e completas que nem sinto mais falta de doce depois do jantar. E o melhor, recebi tudo direto no WhatsApp, com receitas rápidas, práticas e diferentes de tudo que já provei. São 50 receitas exclusivas que ajudam a reduzir o inchaço, emagrecer naturalmente, parar de atacar besteira, fora de hora, e ainda manter o prazer de comer bem todos os dias. Quer experimentar também? Clique no link, receba seu conteúdo premium agora mesmo no WhatsApp e dê tchau pro vício nos docinhos da madrugada."

### Exemplo 3 - Artesanato/Renda Extra:
"Eu tinha só 20 reais, nenhuma experiência, e achava que ganhar dinheiro em casa era impossível. Até que vi um vídeo de uma artesã que prometia ensinar tudo pelo WhatsApp, e o melhor, antes mesmo de pagar. Recebi o curso, segui o passo a passo, e no mesmo dia fiz meus primeiros chaveiros. No outro, já tinha vendido e recuperado meu investimento. Hoje faço renda extra com peças de resina, assim como centenas de alunas que começaram do zero, sem máquinas caras e com pouco investimento. Quer começar agora? Me chama no WhatsApp que te envio o curso antes do pagamento. Só enquanto essa chance está aberta."

### Exemplo 4 - Coquedama/Jardinagem:
"O segredo para fazer uma coquedama que não murcha é simples, você precisa parar de fazer o musgo que todo mundo faz. Se você ainda acha que é necessário regar coquedama todo dia, porque o musgo não mantém a umidade por muito tempo e sempre acaba secando ou desfazendo. É porque você ainda não conhece a técnica de cultivo que está revolucionando a jardinagem decorativa. Agora imagine, poder fazer qualquer tipo de coquedama com um musgo verdinho, resistente, e que não seca nem no calor do deserto. E quando eu digo que não desfaz na base, gente, é isso aqui que eu quero mostrar. É o tipo de resultado que encanta o visitante e facilita o seu trabalho. Imagine poder produzir tudo com antecedência, manter elas vivas por muito mais tempo sem perder a beleza e a vitalidade. E ainda receber elogios de visitantes dizendo que suas coquedamas ficaram perfeitas o tempo todo, sem murchar. Tem vendedores de cursos por aí cobrando R$ 197 só pra ensinar essa técnica de cultivo. Mas eu preparei um material bem mais simples, direto ao ponto, e sem enrolação, pra que você não precise pagar tudo isso. Nesse material eu vou te revelar, o material barato que você já tem aí em casa e que faz toda a diferença na resistência da estrutura. O ponto perfeito da umidade pra ela ficar equilibrada sem encharcamento, sem essecamento e sem desperdício. E ainda vou te mostrar como vender até duas vezes mais caro pelas suas coquedamas, sem perder clientes. Mas atenção! Isso não ficará disponível por muito tempo. Toque agora em Saiba Mais, e me chama no WhatsApp que eu vou te enviar todo o material e você só paga depois de acessá-lo."

## Regras para criar a copy:

1. **GANCHO FORTE**: O início da copy é CRUCIAL. Deve capturar atenção imediatamente com uma afirmação intrigante, pergunta provocativa ou revelação surpreendente. Exemplos de bons ganchos:
   - "Sabe aquelas [coisa comum] que [problema]? Então, essa é completamente diferente."
   - "Essa [descoberta] me fez [resultado desejado], e o que você não imagina?"
   - "Eu tinha só [pouco recurso], nenhuma experiência, e achava que [objetivo] era impossível."
   - "O segredo para [resultado] é simples, você precisa parar de fazer [erro comum]."

2. **ESTRUTURA**: 
   - Hook (gancho) que prende atenção
   - Identificação do problema/dor do público
   - Apresentação da solução de forma natural (história)
   - Benefícios concretos e específicos
   - Prova social ou transformação
   - CTA claro direcionando para WhatsApp

3. **TOM**: Conversacional, como se estivesse falando com um amigo. Use linguagem informal mas profissional.

4. **TAMANHO**: A copy deve ter entre 150-300 palavras, ideal para um áudio de 1-2 minutos.

5. **CTA**: Sempre direcione para o WhatsApp com frases como:
   - "Me chama no WhatsApp"
   - "Clique no link"
   - "Toque em Saiba Mais"
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, productDescription, currentCopy, changeRequest, copyToVary } = await req.json();

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    let messages: { role: string; content: string }[] = [];

    if (action === 'generate') {
      // Generate initial copy
      messages = [
        { role: 'system', content: KNOWLEDGE_BASE },
        { 
          role: 'user', 
          content: `Crie uma copy de áudio para um criativo de vídeo sobre o seguinte produto/oferta:

${productDescription}

Lembre-se de criar um gancho muito forte no início que capture a atenção imediatamente. A copy deve ser natural para ser falada em áudio.

Retorne APENAS a copy, sem explicações ou comentários adicionais.`
        }
      ];
    } else if (action === 'modify') {
      // Modify existing copy
      messages = [
        { role: 'system', content: KNOWLEDGE_BASE },
        { 
          role: 'user', 
          content: `Aqui está a copy atual:

"${currentCopy}"

O usuário solicitou a seguinte alteração:
${changeRequest}

Faça a alteração solicitada mantendo a qualidade e estrutura da copy. Mantenha o gancho forte e o CTA direcionando para WhatsApp.

Retorne APENAS a nova copy modificada, sem explicações ou comentários adicionais.`
        }
      ];
    } else if (action === 'createVariations') {
      // Create 2 variations of approved copy
      messages = [
        { role: 'system', content: KNOWLEDGE_BASE },
        { 
          role: 'user', 
          content: `Aqui está a copy aprovada:

"${copyToVary}"

Crie 2 variações desta copy. As variações devem:
- Manter a mesma mensagem central e CTA
- Usar diferentes ganchos (abordagens diferentes para iniciar)
- Ter estilos ligeiramente diferentes de contar a história
- Manter o mesmo tamanho aproximado

Retorne as 2 variações em formato JSON assim:
{
  "variations": [
    "copy variação 1 aqui",
    "copy variação 2 aqui"
  ]
}

Retorne APENAS o JSON, sem markdown ou explicações.`
        }
      ];
    }

    console.log(`Generating copy with action: ${action}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let result: any = { copy: content };

    if (action === 'createVariations') {
      try {
        // Parse JSON response for variations
        const parsed = JSON.parse(content);
        result = { variations: parsed.variations };
      } catch (e) {
        console.error('Error parsing variations JSON:', e);
        // Try to extract variations manually
        result = { variations: [content, content] };
      }
    }

    console.log('Copy generated successfully');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-creative-copy function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
