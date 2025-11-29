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
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nComo especialista em tráfego pago, analise APENAS o CPL (Custo por Lead) destas métricas. Seja direto, profissional e use linguagem de marketing digital. Identifique:\n1. Performance geral do CPL (use os benchmarks)\n2. Tendências ao longo do tempo (houve dias bons? quando ficou ruim?)\n3. Com base no tipo de campanha e criativo do usuário, dê um diagnóstico preciso\n4. Recomendações práticas e acionáveis\n\nMantenha tom sério mas acessível. Máximo 4 parágrafos curtos.`;
    } else if (section === "conversion") {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nComo especialista em tráfego pago, analise APENAS a TAXA DE CONVERSÃO destas métricas. Seja direto, profissional e use linguagem de marketing digital. Identifique:\n1. Performance geral da conversão (use os benchmarks)\n2. Tendências ao longo do tempo\n3. Com base no tipo de campanha e alinhamento de funil, dê um diagnóstico preciso\n4. Recomendações práticas e acionáveis\n\nMantenha tom sério mas acessível. Máximo 4 parágrafos curtos.`;
    } else if (section === "roas") {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nComo especialista em tráfego pago, analise APENAS o ROAS destas métricas. Seja direto, profissional e use linguagem de marketing digital. Identifique:\n1. Performance geral do ROAS (use os benchmarks)\n2. Relação entre CPL, conversão e ROAS\n3. Diagnóstico preciso com base nas outras métricas\n4. Recomendações práticas para melhorar o retorno\n\nMantenha tom sério mas acessível. Máximo 4 parágrafos curtos.`;
    } else {
      prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nComo especialista em tráfego pago, faça um RESUMO EXECUTIVO desta campanha. Seja direto e estratégico:\n1. Visão geral da performance (está dando lucro? vale a pena continuar?)\n2. Principal problema identificado\n3. Principal oportunidade de melhoria\n4. Próximos passos recomendados (máximo 3 ações prioritárias)\n\nTom executivo, direto ao ponto. Máximo 4 parágrafos curtos.`;
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
            content: "Você é um especialista em tráfego pago e análise de métricas de marketing digital. Seja profissional, direto e use linguagem que conecte com gestores de tráfego. Mantenha seriedade mas seja acessível."
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
