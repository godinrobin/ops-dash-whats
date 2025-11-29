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
Avalie o CPL com base no tipo de campanha do contexto (sem mencionar valores ideais explicitamente).

⚠️ **PONTOS DE ATENÇÃO**
Identifique tendências e SEMPRE INFORME AS DATAS específicas quando houver mudanças (ex: "a partir de 15/01", "entre 10/01 e 15/01"). Mencione quando houve dias bons e quando piorou.

💡 **SUGESTÕES DE MELHORIA**
Dê 2-3 sugestões práticas com base no criativo e campanha. Deixe claro que são sugestões e insights, não verdades absolutas.

Use emojis moderadamente. Tom direto, profissional mas acessível. Máximo 3-4 parágrafos curtos.`;
    } else if (section === "conversion") {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nAnalise APENAS a TAXA DE CONVERSÃO. Seja direto e use linguagem de gestor de tráfego. Estruture assim:

📊 **PERFORMANCE**
Avalie a conversão (use benchmarks: >15% bom, <10% baixo).

⚠️ **PONTOS DE ATENÇÃO**
Identifique tendências e relação com tipo de campanha. SEMPRE INFORME AS DATAS específicas quando houver problemas (ex: "a partir de 12/01", "no período de 05/01 a 10/01").

💡 **SUGESTÕES DE MELHORIA**
Dê 2-3 sugestões práticas focadas em alinhamento de funil. Deixe claro que são sugestões baseadas na análise, não certezas.

Use emojis moderadamente. Tom direto, profissional mas acessível. Máximo 3-4 parágrafos curtos.`;
    } else if (section === "roas") {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nAnalise APENAS o ROAS. Seja direto e use linguagem de gestor de tráfego. Estruture assim:

📊 **PERFORMANCE**
Avalie o ROAS (use benchmarks: >2x bom, <1.5x baixo).

⚠️ **PONTOS DE ATENÇÃO**
Relacione CPL + conversão para diagnóstico preciso. SEMPRE INFORME AS DATAS quando houver quedas ou melhorias no ROAS (ex: "ROAS caiu a partir de 20/01").

💡 **SUGESTÕES DE MELHORIA**
Dê 2-3 sugestões prioritárias para melhorar retorno. Apresente como insights, não como afirmações absolutas.

Use emojis moderadamente. Tom direto, profissional mas acessível. Máximo 3-4 parágrafos curtos.`;
    } else {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nFaça um RESUMO EXECUTIVO. Seja direto e estratégico. Estruture assim:

✅ **VISÃO GERAL**
A campanha está lucrativa? Vale continuar?

🎯 **DIAGNÓSTICO**
Principal problema e oportunidade. Se houver períodos específicos com problemas, mencione as datas.

🚀 **PRÓXIMOS PASSOS**
2-3 sugestões prioritárias imediatas. Deixe claro que são recomendações baseadas na análise dos dados.

Use emojis moderadamente. Tom executivo e direto. Máximo 3-4 parágrafos curtos.`;
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
            content: "Você é um especialista em tráfego pago. Use linguagem de gestor de tráfego - direto, sem formalidades. Seja profissional mas acessível. Formate com tópicos usando emojis moderadamente (📊, ⚠️, 💡, ✅, 🎯, 🚀). Destaque insights importantes em negrito com **texto**. IMPORTANTE: Sempre que identificar problemas ou melhorias, mencione as DATAS ESPECÍFICAS dos dados analisados. Deixe claro que suas análises são sugestões e insights baseados nos dados, não verdades absolutas - use termos como 'sugiro', 'pode indicar', 'recomendo considerar'."
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
