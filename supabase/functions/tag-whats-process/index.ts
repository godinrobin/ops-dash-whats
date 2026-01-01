import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, token",
};

interface WebhookPayload {
  event: string;
  instanceName?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
    message?: {
      imageMessage?: {
        mimetype?: string;
        caption?: string;
      };
      documentMessage?: {
        mimetype?: string;
        fileName?: string;
      };
    };
    messageType?: string;
    pushName?: string;
    messageTimestamp?: number;
  };
}

const PAGO_LABEL_NAME = "Pago";

serve(async (req) => {
  console.log("[TAG-WHATS] ====== FUNCTION STARTED ======");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  
  console.log("[TAG-WHATS] Environment check:", { 
    hasSupabaseUrl: !!supabaseUrl, 
    hasServiceKey: !!supabaseServiceKey, 
    hasOpenaiKey: !!openaiKey 
  });
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const rawBody = await req.text();
    console.log("[TAG-WHATS] Raw request body:", rawBody.substring(0, 1000));
    
    const payload: WebhookPayload = JSON.parse(rawBody);
    console.log("[TAG-WHATS] Parsed payload - event:", payload.event, "instanceName:", payload.instanceName);

    // Only process message events
    if (payload.event !== "messages" && payload.event !== "messages.upsert") {
      console.log("[TAG-WHATS] Ignoring event:", payload.event);
      return new Response(JSON.stringify({ success: true, message: "Ignored event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = payload.data;
    console.log("[TAG-WHATS] Data check:", { 
      hasData: !!data, 
      hasKey: !!data?.key, 
      fromMe: data?.key?.fromMe,
      messageId: data?.key?.id,
      hasImageMessage: !!data?.message?.imageMessage,
      hasDocumentMessage: !!data?.message?.documentMessage
    });
    
    if (!data || !data.key || data.key.fromMe) {
      console.log("[TAG-WHATS] Ignoring: no data or fromMe");
      return new Response(JSON.stringify({ success: true, message: "Ignored message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if it's an image or PDF
    const isImage = !!data.message?.imageMessage;
    const isPdf = data.message?.documentMessage?.mimetype === "application/pdf";
    
    console.log("[TAG-WHATS] Media check:", { isImage, isPdf });
    
    if (!isImage && !isPdf) {
      console.log("[TAG-WHATS] Not image or PDF, exiting");
      return new Response(JSON.stringify({ success: true, message: "Not image or PDF" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageType = isImage ? "image" : "pdf";
    const remoteJid = data.key.remoteJid || "";
    const phone = remoteJid.replace(/@.*$/, "");
    const instanceName = payload.instanceName || "";
    
    console.log("[TAG-WHATS] Processing:", { messageType, phone, instanceName, messageId: data.key.id });
    
    console.log(`[TAG-WHATS] Processing ${messageType} from ${phone} on instance ${instanceName}`);

    // Find the instance
    const { data: instance, error: instanceError } = await supabase
      .from("maturador_instances")
      .select("id, user_id, uazapi_token")
      .eq("instance_name", instanceName)
      .single();

    if (instanceError || !instance) {
      console.error("[TAG-WHATS] Instance not found:", instanceName);
      return new Response(JSON.stringify({ success: false, error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if Tag Whats is configured for this instance
    const { data: config, error: configError } = await supabase
      .from("tag_whats_configs")
      .select("*")
      .eq("instance_id", instance.id)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      console.log("[TAG-WHATS] No active config for instance:", instance.id);
      return new Response(JSON.stringify({ success: true, message: "No active config" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check filters
    if ((isImage && !config.filter_images) || (isPdf && !config.filter_pdfs)) {
      console.log("[TAG-WHATS] Message type filtered out");
      return new Response(JSON.stringify({ success: true, message: "Message type filtered" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get media URL from UAZAPI
    const uazapiToken = instance.uazapi_token;
    if (!uazapiToken) {
      console.error("[TAG-WHATS] No UAZAPI token for instance");
      return new Response(JSON.stringify({ success: false, error: "No UAZAPI token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get global UAZAPI config
    const { data: globalConfig } = await supabase
      .from("whatsapp_api_config")
      .select("uazapi_base_url")
      .limit(1)
      .single();
    
    const uazapiBaseUrl = globalConfig?.uazapi_base_url || "https://zapdata.uazapi.com";
    const messageId = data.key.id || "";

    // Download media
    const mediaResponse = await fetch(`${uazapiBaseUrl}/media/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": uazapiToken,
      },
      body: JSON.stringify({ messageid: messageId }),
    });

    if (!mediaResponse.ok) {
      console.error("[TAG-WHATS] Failed to download media:", await mediaResponse.text());
      
      // Log the failure
      await supabase.from("tag_whats_logs").insert({
        user_id: instance.user_id,
        config_id: config.id,
        instance_id: instance.id,
        contact_phone: phone,
        message_type: messageType,
        is_pix_payment: false,
        label_applied: false,
        error_message: "Failed to download media",
      });
      
      return new Response(JSON.stringify({ success: false, error: "Failed to download media" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mediaData = await mediaResponse.json();
    let mediaBase64 = mediaData.base64 || mediaData.data;
    
    if (!mediaBase64) {
      console.error("[TAG-WHATS] No base64 in media response");
      return new Response(JSON.stringify({ success: false, error: "No media data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For PDFs, we need to extract text
    let contentToAnalyze = "";
    if (isPdf) {
      // For now, we'll send the PDF base64 to GPT-4 Vision which can read PDFs
      // In production, you might want to use a PDF parsing library
      contentToAnalyze = `This is a PDF document. Please analyze if this is a PIX payment receipt.`;
    }

    // Analyze with ChatGPT
    if (!openaiKey) {
      console.error("[TAG-WHATS] No OpenAI API key configured");
      return new Response(JSON.stringify({ success: false, error: "No OpenAI API key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um analisador de comprovantes de pagamento PIX. 
Analise a imagem/documento e determine se é um comprovante de pagamento PIX válido.

Responda APENAS com um JSON no formato:
{
  "is_pix_payment": true/false,
  "confidence": 0-100,
  "reason": "breve explicação"
}

Critérios para identificar um comprovante PIX:
- Presença de informações como "Pix", "Transferência", "Comprovante"
- Dados de origem e destino (nome, CPF/CNPJ parcial, banco)
- Valor da transação
- Data e hora
- Código de autenticação ou ID da transação

Se não for possível determinar ou a imagem não for clara, retorne is_pix_payment: false.`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${isImage ? "image/jpeg" : "application/pdf"};base64,${mediaBase64}`,
                  detail: "low",
                },
              },
              {
                type: "text",
                text: isPdf ? contentToAnalyze : "Analise esta imagem e determine se é um comprovante de pagamento PIX.",
              },
            ],
          },
        ],
        max_tokens: 200,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("[TAG-WHATS] OpenAI error:", errorText);
      
      await supabase.from("tag_whats_logs").insert({
        user_id: instance.user_id,
        config_id: config.id,
        instance_id: instance.id,
        contact_phone: phone,
        message_type: messageType,
        is_pix_payment: false,
        label_applied: false,
        error_message: `OpenAI error: ${errorText.substring(0, 200)}`,
      });
      
      return new Response(JSON.stringify({ success: false, error: "OpenAI error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await openaiResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || "";
    console.log("[TAG-WHATS] AI response:", aiContent);

    // Parse AI response
    let isPixPayment = false;
    let aiResponse = null;
    try {
      // Extract JSON from response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResponse = JSON.parse(jsonMatch[0]);
        isPixPayment = aiResponse.is_pix_payment === true && (aiResponse.confidence || 0) >= 70;
      }
    } catch (parseError) {
      console.error("[TAG-WHATS] Failed to parse AI response:", parseError);
    }

    let labelApplied = false;

    if (isPixPayment) {
      console.log("[TAG-WHATS] PIX payment detected! Applying label...");

      // First, get or create the "Pago" label
      let pagoLabelId = config.pago_label_id;

      if (!pagoLabelId) {
        // Get all labels
        const labelsResponse = await fetch(`${uazapiBaseUrl}/labels`, {
          method: "GET",
          headers: { "token": uazapiToken },
        });

        if (labelsResponse.ok) {
          const labels = await labelsResponse.json();
          const pagoLabel = labels.find((l: any) => 
            l.name?.toLowerCase() === PAGO_LABEL_NAME.toLowerCase()
          );
          
          if (pagoLabel) {
            pagoLabelId = pagoLabel.labelid || pagoLabel.id;
            
            // Save to config
            await supabase
              .from("tag_whats_configs")
              .update({ pago_label_id: pagoLabelId })
              .eq("id", config.id);
          }
        }
      }

      if (pagoLabelId) {
        // Apply label to chat
        const labelResponse = await fetch(`${uazapiBaseUrl}/chat/labels`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "token": uazapiToken,
          },
          body: JSON.stringify({
            number: phone,
            add_labelid: pagoLabelId,
          }),
        });

        if (labelResponse.ok) {
          labelApplied = true;
          console.log("[TAG-WHATS] Label applied successfully!");
        } else {
          const labelError = await labelResponse.text();
          console.error("[TAG-WHATS] Failed to apply label:", labelError);
        }
      } else {
        console.log("[TAG-WHATS] No 'Pago' label found. Please create it in WhatsApp Business first.");
      }
    }

    // Log the result
    await supabase.from("tag_whats_logs").insert({
      user_id: instance.user_id,
      config_id: config.id,
      instance_id: instance.id,
      contact_phone: phone,
      message_type: messageType,
      is_pix_payment: isPixPayment,
      label_applied: labelApplied,
      ai_response: aiResponse,
    });

    return new Response(
      JSON.stringify({
        success: true,
        is_pix_payment: isPixPayment,
        label_applied: labelApplied,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[TAG-WHATS] Error:", error);
    const errMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
