import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateUserAccess, forbiddenResponse, unauthorizedResponse } from "../_shared/validateAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
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

    const { messages, systemPrompt } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido, tente novamente mais tarde." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes, adicione fundos à sua conta." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const error = await response.text();
      console.error("AI API Error:", error);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua solicitação.";

    return new Response(
      JSON.stringify({ content }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error in keyword-generator-chat:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
