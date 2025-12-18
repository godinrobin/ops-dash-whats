import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { metricsContext, contextInfo, knowledgeBase, section } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let prompt = "";
    
    if (section === "cpl") {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nAnalise APENAS o CPL (Custo por Lead). Seja direto e use linguagem de gestor de tráfego. Estruture assim:

📊 **PERFORMANCE**
Avalie o CPL. NÃO mencione valores benchmark ao usuário. Se o CPL está bom, diga que está bom e não sugira melhorias. Se está ruim, explique por quê.

⚠️ **PONTOS DE ATENÇÃO**
Identifique tendências e SEMPRE INFORME AS DATAS específicas quando houver mudanças (ex: "a partir de 15/01", "entre 10/01 e 15/01"). Mencione quando houve dias bons e quando piorou.

💡 **SUGESTÕES DE MELHORIA**
Se o CPL está ruim, dê 2-3 sugestões práticas:
- PRIORIZE melhorar o GANCHO DO CRIATIVO (primeiros 3 segundos são cruciais)
- Não diga "reduza o orçamento", diga "um bom teste seria reduzir o orçamento para..."
- Seja delicado: use "sugiro testar", "pode ser interessante", "um bom teste seria"
- CRÍTICO: Verifique o tipo de campanha atual no CONTEXTO DO USUÁRIO antes de recomendar mudanças
- NUNCA recomende "Conversão otimizada para vendas" quando CPL está alto, essa campanha NATIVAMENTE tem CPL alto e pode piorar
- Se o usuário já está usando um tipo de campanha específico, NÃO recomende o mesmo tipo que ele já usa
NÃO sugira melhorias se a métrica já está boa.

Use emojis moderadamente. Tom direto, profissional mas acessível. Máximo 3-4 parágrafos curtos.`;
    } else if (section === "conversion") {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nAnalise APENAS a TAXA DE CONVERSÃO. Seja direto e use linguagem de gestor de tráfego. Estruture assim:

📊 **PERFORMANCE**
Avalie a conversão. NÃO mencione valores benchmark ao usuário. Se a conversão está boa (>15%), diga que está boa e não sugira melhorias nela.

⚠️ **PONTOS DE ATENÇÃO**
Identifique tendências e relação com tipo de campanha. SEMPRE INFORME AS DATAS específicas quando houver problemas (ex: "a partir de 12/01", "no período de 05/01 a 10/01").

💡 **SUGESTÕES DE MELHORIA**
Se a conversão está ruim, dê 2-3 sugestões práticas:
- Foque em alinhamento de funil e entregável
- Verifique o tipo de campanha atual no CONTEXTO DO USUÁRIO antes de sugerir mudanças
- Se o usuário já está usando um tipo específico de campanha, NÃO recomende o mesmo tipo
- Seja delicado: use "sugiro testar", "pode valer a pena", "um bom teste seria"
NÃO sugira melhorias se a métrica já está boa (>15%).

Use emojis moderadamente. Tom direto, profissional mas acessível. Máximo 3-4 parágrafos curtos.`;
    } else if (section === "roas") {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nAnalise APENAS o ROAS. Seja direto e use linguagem de gestor de tráfego. Estruture assim:

📊 **PERFORMANCE**
Avalie o ROAS. NÃO mencione valores benchmark ao usuário. Se o ROAS está bom (>2x), diga que está bom e não sugira melhorias.

⚠️ **PONTOS DE ATENÇÃO**
Relacione CPL + conversão para diagnóstico preciso. SEMPRE INFORME AS DATAS quando houver quedas ou melhorias no ROAS (ex: "ROAS caiu a partir de 20/01").

💡 **SUGESTÕES DE MELHORIA**
Se o ROAS está ruim, dê 2-3 sugestões prioritárias:
- Verifique o tipo de campanha atual no CONTEXTO DO USUÁRIO antes de sugerir mudanças
- NUNCA recomende "Conversão otimizada para vendas" se CPL já está alto
- Se o usuário já está usando um tipo específico de campanha, NÃO recomende o mesmo tipo
- Seja delicado: use "sugiro testar", "pode ser interessante", "um bom teste seria"
- Apresente como insights, não como verdades absolutas
NÃO sugira melhorias se a métrica já está boa (>2x).

Use emojis moderadamente. Tom direto, profissional mas acessível. Máximo 3-4 parágrafos curtos.`;
    } else {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nFaça um RESUMO EXECUTIVO. Seja direto e estratégico. Estruture assim:

✅ **VISÃO GERAL**
A campanha está lucrativa? Vale continuar?

🎯 **DIAGNÓSTICO**
Principal problema e oportunidade. Se houver períodos específicos com problemas, mencione as datas.

🚀 **PRÓXIMOS PASSOS**
2-3 sugestões prioritárias imediatas:
- CRÍTICO: Verifique o tipo de campanha atual no CONTEXTO DO USUÁRIO antes de recomendar mudanças
- NUNCA recomende "Conversão otimizada para vendas" se CPL está alto, essa campanha tem CPL alto nativamente
- Se o usuário já está usando um tipo específico de campanha, NÃO recomende o mesmo tipo que ele já usa
- Seja delicado: use "sugiro testar", "pode valer a pena", "um bom teste seria"
- Deixe claro que são recomendações baseadas na análise, não verdades absolutas

📚 **RECOMENDAÇÃO DE TREINAMENTO**
Com base nos problemas identificados, sugira 1-2 aulas específicas da Comunidade X1 que podem ajudar:
- Se problema de conversão/funil: "Automação de WhatsApp", "Crie seu ebook com IA" ou "Analisando Métricas (Funil)"
- Se problema de CPL/campanhas: "Subindo ads" ou "Analisando Métricas (Anúncios)"
- Se problema de otimização: "TRACKEAMENTO ALÉM DA ETIQUETA" ou "Como destravar COMPRAR POR MENSAGEM"
Explique brevemente como cada aula da Comunidade X1 pode ajudar no problema específico identificado.

Use emojis moderadamente. Tom executivo e direto. Máximo 4-5 parágrafos curtos.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Você é um especialista em tráfego pago. Use linguagem de gestor de tráfego - direto, sem formalidades. Seja profissional mas acessível. Formate com tópicos usando emojis moderadamente (📊, ⚠️, 💡, ✅, 🎯, 🚀, 📚). Destaque insights importantes em negrito com **texto**. IMPORTANTE: Os dados de métricas estão ORDENADOS DO MAIS ANTIGO PARA O MAIS RECENTE (de cima para baixo na tabela). Sempre que identificar problemas ou melhorias, mencione as DATAS ESPECÍFICAS dos dados analisados respeitando essa ordem cronológica. Seja DELICADO nas sugestões - use 'sugiro testar', 'pode valer a pena', 'um bom teste seria' ao invés de afirmações absolutas. NÃO mencione valores benchmark ao usuário. Se uma métrica está boa, diga que está boa e NÃO sugira melhorias nela - foque apenas nas métricas ruins. CRÍTICO: Sempre verifique o CONTEXTO DO USUÁRIO antes de recomendar mudanças de campanha - NUNCA recomende o tipo de campanha que o usuário JÁ está usando. NUNCA recomende 'Conversão otimizada para vendas' quando CPL está alto, pois essa campanha tem CPL naturalmente alto. Os produtos são INFOPRODUTOS (sempre disponíveis, valores não mudam) - NUNCA sugira verificar disponibilidade de estoque ou alteração de preços. Para treinamentos, sempre recomende aulas da Comunidade X1."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de taxa excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao conectar com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-metrics error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
