import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @ts-ignore - pdf-lib for PDF text extraction
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

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

// Function to extract text from PDF using pdf-lib
async function extractPdfText(base64Data: string): Promise<string> {
  try {
    console.log("[TAG-WHATS] Starting PDF text extraction...");
    
    // Decode base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Load PDF document
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    
    console.log("[TAG-WHATS] PDF has", pages.length, "pages");
    
    // pdf-lib doesn't have direct text extraction, so we'll use a different approach
    // We'll extract what metadata and info we can, then use AI to analyze based on that
    
    const form = pdfDoc.getForm();
    let extractedInfo: string[] = [];
    
    // Try to get form field values if any
    try {
      const fields = form.getFields();
      for (const field of fields) {
        const name = field.getName();
        extractedInfo.push(`Field: ${name}`);
      }
    } catch (e) {
      console.log("[TAG-WHATS] No form fields found");
    }
    
    // Get document metadata
    const title = pdfDoc.getTitle();
    const author = pdfDoc.getAuthor();
    const subject = pdfDoc.getSubject();
    const keywords = pdfDoc.getKeywords();
    const creator = pdfDoc.getCreator();
    const producer = pdfDoc.getProducer();
    
    if (title) extractedInfo.push(`Título: ${title}`);
    if (author) extractedInfo.push(`Autor: ${author}`);
    if (subject) extractedInfo.push(`Assunto: ${subject}`);
    if (keywords) extractedInfo.push(`Palavras-chave: ${keywords}`);
    if (creator) extractedInfo.push(`Criador: ${creator}`);
    if (producer) extractedInfo.push(`Produtor: ${producer}`);
    
    // Since pdf-lib can't extract text content directly, we'll use a workaround:
    // Send basic info and let the AI know this is a PDF that needs analysis
    const basicInfo = extractedInfo.length > 0 
      ? extractedInfo.join("\n") 
      : "PDF document received - metadata not available";
    
    console.log("[TAG-WHATS] Extracted PDF info:", basicInfo);
    
    return basicInfo;
  } catch (error) {
    console.error("[TAG-WHATS] PDF extraction error:", error);
    return `Error extracting PDF: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// PDF analysis is now done directly with GPT-4 Vision (no text extraction needed)
// This function is kept for backwards compatibility but just returns a message
async function extractPdfTextWithPdfJs(base64Data: string): Promise<string> {
  // PDFs are now analyzed visually with GPT-4 Vision, no text extraction needed
  return "PDF will be analyzed visually with GPT-4 Vision";
}

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

    // Download media using correct UAZAPI endpoint: POST /message/download
    console.log("[TAG-WHATS] Downloading media from UAZAPI...");
    console.log("[TAG-WHATS] Download request:", { 
      url: `${uazapiBaseUrl}/message/download`,
      messageId: messageId 
    });
    
    const mediaResponse = await fetch(`${uazapiBaseUrl}/message/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": uazapiToken,
      },
      body: JSON.stringify({ 
        id: messageId,
        return_base64: true,
        return_link: false
      }),
    });

    const mediaResponseText = await mediaResponse.text();
    console.log("[TAG-WHATS] Media download response status:", mediaResponse.status);
    console.log("[TAG-WHATS] Media download response preview:", mediaResponseText.substring(0, 500));

    if (!mediaResponse.ok) {
      console.error("[TAG-WHATS] Failed to download media:", mediaResponseText);
      
      // Log the failure
      await supabase.from("tag_whats_logs").insert({
        user_id: instance.user_id,
        config_id: config.id,
        instance_id: instance.id,
        contact_phone: phone,
        message_type: messageType,
        is_pix_payment: false,
        label_applied: false,
        error_message: `Failed to download media: ${mediaResponseText.substring(0, 200)}`,
      });
      
      return new Response(JSON.stringify({ success: false, error: "Failed to download media" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let mediaData;
    try {
      mediaData = JSON.parse(mediaResponseText);
    } catch (e) {
      console.error("[TAG-WHATS] Failed to parse media response as JSON");
      return new Response(JSON.stringify({ success: false, error: "Invalid media response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // UAZAPI returns base64Data and mimetype in the response
    const mediaBase64 = mediaData.base64Data || mediaData.base64 || mediaData.data;
    const mediaMimetype = mediaData.mimetype || (isImage ? "image/jpeg" : "application/pdf");
    
    console.log("[TAG-WHATS] Media extracted:", { 
      hasBase64: !!mediaBase64, 
      base64Length: mediaBase64?.length || 0,
      mimetype: mediaMimetype 
    });
    
    if (!mediaBase64) {
      console.error("[TAG-WHATS] No base64 in media response. Keys available:", Object.keys(mediaData));
      
      await supabase.from("tag_whats_logs").insert({
        user_id: instance.user_id,
        config_id: config.id,
        instance_id: instance.id,
        contact_phone: phone,
        message_type: messageType,
        is_pix_payment: false,
        label_applied: false,
        error_message: `No base64 data. Response keys: ${Object.keys(mediaData).join(', ')}`,
      });
      
      return new Response(JSON.stringify({ success: false, error: "No media data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    let aiContent = "";
    
    const mediaDataUrl = `data:${mediaMimetype};base64,${mediaBase64}`;
    
    if (isPdf) {
      // For PDFs: Use Gemini which natively supports PDF analysis
      // OpenAI Vision does NOT support PDFs, only images
      console.log("[TAG-WHATS] Sending PDF to Gemini for analysis. Data URL length:", mediaDataUrl.length);
      
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      
      if (!lovableApiKey) {
        console.error("[TAG-WHATS] No LOVABLE_API_KEY for PDF analysis");
        
        await supabase.from("tag_whats_logs").insert({
          user_id: instance.user_id,
          config_id: config.id,
          instance_id: instance.id,
          contact_phone: phone,
          message_type: messageType,
          is_pix_payment: false,
          label_applied: false,
          error_message: "No LOVABLE_API_KEY configured for PDF analysis",
        });
        
        return new Response(JSON.stringify({ success: false, error: "No API key for PDF" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const geminiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analise este documento PDF e determine se é um comprovante de pagamento PIX válido."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: mediaDataUrl
                  }
                }
              ]
            }
          ],
        }),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("[TAG-WHATS] Gemini error for PDF:", errorText);
        
        await supabase.from("tag_whats_logs").insert({
          user_id: instance.user_id,
          config_id: config.id,
          instance_id: instance.id,
          contact_phone: phone,
          message_type: messageType,
          is_pix_payment: false,
          label_applied: false,
          error_message: `Gemini error: ${errorText.substring(0, 200)}`,
        });
        
        return new Response(JSON.stringify({ success: false, error: "Gemini error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const geminiResult = await geminiResponse.json();
      aiContent = geminiResult.choices?.[0]?.message?.content || "";
      console.log("[TAG-WHATS] Gemini PDF response:", aiContent);
      
    } else {
      // For images: Use GPT-4 Vision
      console.log("[TAG-WHATS] Sending image to OpenAI Vision for analysis. Data URL length:", mediaDataUrl.length);

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
                    url: mediaDataUrl,
                    detail: "high",
                  },
                },
                {
                  type: "text",
                  text: "Analise esta imagem e determine se é um comprovante de pagamento PIX.",
                },
              ],
            },
          ],
          max_tokens: 300,
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error("[TAG-WHATS] OpenAI Vision error:", errorText);
        
        await supabase.from("tag_whats_logs").insert({
          user_id: instance.user_id,
          config_id: config.id,
          instance_id: instance.id,
          contact_phone: phone,
          message_type: messageType,
          is_pix_payment: false,
          label_applied: false,
          error_message: `OpenAI Vision error: ${errorText.substring(0, 200)}`,
        });
        
        return new Response(JSON.stringify({ success: false, error: "OpenAI Vision error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResult = await openaiResponse.json();
      aiContent = aiResult.choices?.[0]?.message?.content || "";
      console.log("[TAG-WHATS] OpenAI Vision response:", aiContent);
    }
    
    
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
    let alreadyHasLabel = false;
    let errorMessage: string | null = null;

    if (isPixPayment) {
      console.log("[TAG-WHATS] PIX payment detected! Checking if already labeled...");
      
      // Check if this contact already has the "Pago" label applied
      const { data: existingLog, error: existingLogError } = await supabase
        .from("tag_whats_logs")
        .select("id")
        .eq("instance_id", instance.id)
        .eq("contact_phone", phone)
        .eq("label_applied", true)
        .limit(1)
        .maybeSingle();
      
      if (existingLog) {
        console.log("[TAG-WHATS] Contact already has 'Pago' label applied, skipping...");
        alreadyHasLabel = true;
      }
      
      if (!alreadyHasLabel) {
        // Check if we should skip label application due to disable_label_on_charge
        const shouldSkipLabelApplication = config.disable_label_on_charge && config.auto_charge_enabled;
        
        if (shouldSkipLabelApplication) {
          console.log("[TAG-WHATS] Skipping label application due to disable_label_on_charge setting");
        } else {
          console.log("[TAG-WHATS] First time - applying label...");

        // First, get the "Pago" label id (config can get stale if labels are recreated)
        const fetchPagoLabelIdByName = async (): Promise<string | null> => {
          try {
            console.log("[TAG-WHATS] Fetching labels from:", `${uazapiBaseUrl}/labels`);
            
            const labelsResponse = await fetch(`${uazapiBaseUrl}/labels`, {
              method: "GET",
              headers: { token: uazapiToken },
            });

            const responseText = await labelsResponse.text();
            console.log("[TAG-WHATS] Labels API response status:", labelsResponse.status);
            console.log("[TAG-WHATS] Labels API raw response:", responseText.substring(0, 500));

            if (!labelsResponse.ok) {
              console.error("[TAG-WHATS] Failed to fetch labels:", labelsResponse.status, responseText);
              return null;
            }

            let labels: any;
            try {
              labels = JSON.parse(responseText);
            } catch (parseError) {
              console.error("[TAG-WHATS] Failed to parse labels response as JSON:", parseError);
              return null;
            }

            // Log all available labels for debugging
            if (Array.isArray(labels) && labels.length > 0) {
              console.log("[TAG-WHATS] Available labels:", labels.map((l: any) => ({
                id: l?.labelid || l?.id,
                name: l?.name,
                color: l?.color
              })));
            } else {
              console.log("[TAG-WHATS] No labels returned from API. Labels response type:", typeof labels, "isArray:", Array.isArray(labels));
            }

            const pagoLabel = Array.isArray(labels)
              ? labels.find((l: any) => l?.name?.toLowerCase?.() === PAGO_LABEL_NAME.toLowerCase())
              : null;

            const id = pagoLabel?.labelid || pagoLabel?.id || null;
            console.log("[TAG-WHATS] Pago label lookup:", {
              found: !!id,
              id,
              labelsCount: Array.isArray(labels) ? labels.length : null,
              pagoLabelFound: !!pagoLabel,
            });

            return id;
          } catch (e) {
            console.error("[TAG-WHATS] Error fetching labels:", e);
            return null;
          }
        };

        // Function to create the "Pago" label if it doesn't exist
        const createPagoLabel = async (): Promise<string | null> => {
          try {
            console.log("[TAG-WHATS] Attempting to create 'Pago' label...");
            
            const createResponse = await fetch(`${uazapiBaseUrl}/label/edit`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                token: uazapiToken,
              },
              body: JSON.stringify({
                name: PAGO_LABEL_NAME,
                color: 6, // Green color for "Pago"
              }),
            });
            
            const createText = await createResponse.text();
            console.log("[TAG-WHATS] Create label response:", createResponse.status, createText);
            
            if (createResponse.ok) {
              // Wait a bit for sync and fetch the new label ID
              await new Promise(resolve => setTimeout(resolve, 1000));
              const newId = await fetchPagoLabelIdByName();
              if (newId) {
                console.log("[TAG-WHATS] Successfully created 'Pago' label with ID:", newId);
                return newId;
              }
            }
            
            return null;
          } catch (e) {
            console.error("[TAG-WHATS] Error creating label:", e);
            return null;
          }
        };

        let pagoLabelId: string | null = config.pago_label_id || null;

        // If we have an id stored, validate it quickly; if invalid, refresh by name.
        if (pagoLabelId) {
          const freshId = await fetchPagoLabelIdByName();
          if (freshId && freshId !== pagoLabelId) {
            console.log("[TAG-WHATS] Stored pago_label_id differs from current label id. Updating config.", {
              stored: pagoLabelId,
              current: freshId,
            });
            pagoLabelId = freshId;
            await supabase.from("tag_whats_configs").update({ pago_label_id: pagoLabelId }).eq("id", config.id);
          }
          if (!freshId) {
            // Keep stored id and attempt apply; we'll handle stale id error on apply.
            console.log("[TAG-WHATS] Could not validate label list; will try applying stored label id.");
          }
        } else {
          pagoLabelId = await fetchPagoLabelIdByName();
          if (pagoLabelId) {
            await supabase.from("tag_whats_configs").update({ pago_label_id: pagoLabelId }).eq("id", config.id);
          }
        }

        const applyLabelOnce = async (labelId: string) => {
          const labelPayload = {
            number: phone,
            add_labelid: labelId,
          };

          console.log("[TAG-WHATS] Applying label with payload:", JSON.stringify(labelPayload));
          console.log("[TAG-WHATS] API URL:", `${uazapiBaseUrl}/chat/labels`);

          const labelResponse = await fetch(`${uazapiBaseUrl}/chat/labels`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              token: uazapiToken,
            },
            body: JSON.stringify(labelPayload),
          });

          const labelResponseText = await labelResponse.text();
          console.log("[TAG-WHATS] Label API response status:", labelResponse.status);
          console.log("[TAG-WHATS] Label API response:", labelResponseText);

          return { ok: labelResponse.ok, status: labelResponse.status, text: labelResponseText };
        };

        if (pagoLabelId) {
          // Try applying with current/stored id
          const firstTry = await applyLabelOnce(pagoLabelId);

          if (firstTry.ok) {
            labelApplied = true;
            console.log("[TAG-WHATS] Label applied successfully!");
          } else {
            // If label id is stale, refresh by name and retry once
            const looksLikeMissingLabel = firstTry.text?.toLowerCase?.().includes("label does not exist");

            if (looksLikeMissingLabel) {
              console.log("[TAG-WHATS] Label id seems stale. Refreshing by name and retrying...");
              let refreshedId = await fetchPagoLabelIdByName();

              // If still not found, try to create the label
              if (!refreshedId) {
                console.log("[TAG-WHATS] Label not found in list, attempting to create it...");
                refreshedId = await createPagoLabel();
              }

              if (refreshedId) {
                pagoLabelId = refreshedId;
                await supabase.from("tag_whats_configs").update({ pago_label_id: pagoLabelId }).eq("id", config.id);

                const secondTry = await applyLabelOnce(pagoLabelId);
                if (secondTry.ok) {
                  labelApplied = true;
                  console.log("[TAG-WHATS] Label applied successfully after refresh/create!");
                } else {
                  console.error("[TAG-WHATS] Failed to apply label after refresh/create.", secondTry.status, secondTry.text);
                  errorMessage = `Failed to apply label: ${secondTry.text}`;
                }
              } else {
                console.error("[TAG-WHATS] Could not find or create 'Pago' label.");
                errorMessage = "'Pago' label not found and could not be created automatically";
              }
            } else {
              console.error("[TAG-WHATS] Failed to apply label.", firstTry.status, firstTry.text);
              errorMessage = `Failed to apply label: ${firstTry.text}`;
            }
          }
        } else {
          // No label ID stored - try to find or create
          console.log("[TAG-WHATS] No 'Pago' label ID stored. Attempting to find or create...");
          
          let newLabelId = await fetchPagoLabelIdByName();
          if (!newLabelId) {
            console.log("[TAG-WHATS] Label not found, attempting to create...");
            newLabelId = await createPagoLabel();
          }
          
          if (newLabelId) {
            pagoLabelId = newLabelId;
            await supabase.from("tag_whats_configs").update({ pago_label_id: pagoLabelId }).eq("id", config.id);
            
            const applyResult = await applyLabelOnce(pagoLabelId);
            if (applyResult.ok) {
              labelApplied = true;
              console.log("[TAG-WHATS] Label applied successfully after find/create!");
            } else {
              console.error("[TAG-WHATS] Failed to apply label after find/create:", applyResult.text);
              errorMessage = `Failed to apply label: ${applyResult.text}`;
            }
          } else {
            console.log("[TAG-WHATS] Could not find or create 'Pago' label. Manual creation required.");
            errorMessage = "No 'Pago' label configured - create it in WhatsApp Business";
          }
        }
        } // Close else (not shouldSkipLabelApplication)
      } // Close !alreadyHasLabel
    } // Close isPixPayment

    // Auto Charge Logic - Send payment request if enabled
    let chargeSent = false;
    let chargeError: string | null = null;

    // Check if disable_label_on_charge is true - if so, we still detect PIX but don't apply labels
    const shouldSkipLabel = config.disable_label_on_charge && config.auto_charge_enabled;
    if (shouldSkipLabel && isPixPayment && !alreadyHasLabel) {
      console.log("[TAG-WHATS] disable_label_on_charge is enabled - skipping label but will send charge");
      // Reset labelApplied since we're skipping it
      labelApplied = false;
    }

    if (isPixPayment && config.auto_charge_enabled && !alreadyHasLabel) {
      console.log("[TAG-WHATS] ====== STARTING AUTO CHARGE ======");
      console.log("[TAG-WHATS] Charge config:", {
        auto_charge_enabled: config.auto_charge_enabled,
        charge_amount: config.charge_amount,
        charge_item_name: config.charge_item_name,
        charge_pix_key: config.charge_pix_key ? `${config.charge_pix_key.substring(0, 4)}...` : null,
        disable_label_on_charge: config.disable_label_on_charge,
      });

      // Validate charge configuration
      if (!config.charge_amount || config.charge_amount <= 0) {
        console.log("[TAG-WHATS] Charge skipped: invalid amount");
        chargeError = "Valor inválido";
      } else if (!config.charge_item_name) {
        console.log("[TAG-WHATS] Charge skipped: missing item name");
        chargeError = "Nome do item obrigatório";
      } else if (!config.charge_pix_key) {
        console.log("[TAG-WHATS] Charge skipped: missing PIX key");
        chargeError = "Chave PIX obrigatória";
      } else if (!config.charge_pix_name) {
        console.log("[TAG-WHATS] Charge skipped: missing PIX name");
        chargeError = "Nome do recebedor obrigatório";
      } else {
        try {
          console.log(`[TAG-WHATS] Sending charge: amount=${config.charge_amount}, item=${config.charge_item_name}`);
          
          const chargeResponse = await fetch(`${uazapiBaseUrl}/send/request-payment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              token: uazapiToken,
            },
            body: JSON.stringify({
              number: phone.replace(/\D/g, ""),
              amount: config.charge_amount,
              text: config.charge_description || "",
              itemName: config.charge_item_name,
              pixKey: config.charge_pix_key,
              pixType: config.charge_pix_type || "EVP",
              pixName: config.charge_pix_name,
            }),
          });

          const chargeResult = await chargeResponse.json();
          console.log("[TAG-WHATS] Charge response:", JSON.stringify(chargeResult));

          if (chargeResponse.ok && (chargeResult.status === "PENDING" || chargeResult.messageid || chargeResult.success !== false)) {
            chargeSent = true;
            console.log("[TAG-WHATS] Charge sent successfully!");
          } else {
            console.error("[TAG-WHATS] Charge error:", chargeResult);
            chargeError = chargeResult.error || chargeResult.message || "Erro desconhecido";
          }
        } catch (err) {
          console.error("[TAG-WHATS] Charge exception:", err);
          chargeError = err instanceof Error ? err.message : "Erro ao enviar cobrança";
        }
      }
    }

    // Facebook Conversion Tracking
    let conversionSent = false;
    let conversionEventId: string | null = null;
    let conversionError: string | null = null;
    let ctwaClid: string | null = null;
    let fbclid: string | null = null;
    let extractedValue: number | null = null;

    // ============ EARLY LOOKUP: ctwa_clid and value extraction ============
    // This must happen BEFORE any conversion tracking blocks so ctwaClid is available everywhere
    if (isPixPayment) {
      console.log("[TAG-WHATS] PIX detected - looking up ctwa_clid for attribution...");
      
      // Try to get ctwa_clid from ads_whatsapp_leads first
      const { data: leadForCtwa, error: leadCtwaError } = await supabase
        .from("ads_whatsapp_leads")
        .select("ctwa_clid, fbclid")
        .eq("phone", phone)
        .eq("user_id", instance.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      ctwaClid = leadForCtwa?.ctwa_clid || null;
      fbclid = leadForCtwa?.fbclid || null;
      
      console.log("[TAG-WHATS] Attribution lookup (ads_whatsapp_leads):", { 
        found: !!leadForCtwa, 
        ctwa_clid: ctwaClid,
        fbclid: fbclid,
        error: leadCtwaError?.message 
      });
      
      // FALLBACK: If no ctwa_clid found in ads_whatsapp_leads, try inbox_contacts
      if (!ctwaClid) {
        const { data: inboxContactCtwa, error: inboxCtwaError } = await supabase
          .from("inbox_contacts")
          .select("ctwa_clid")
          .eq("phone", phone)
          .eq("user_id", instance.user_id)
          .not("ctwa_clid", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (inboxContactCtwa?.ctwa_clid) {
          ctwaClid = inboxContactCtwa.ctwa_clid;
          console.log("[TAG-WHATS] ✅ ctwa_clid found in inbox_contacts:", ctwaClid);
        } else {
          console.log("[TAG-WHATS] ⚠️ No ctwa_clid found anywhere for phone:", phone, { error: inboxCtwaError?.message });
        }
      }

      // Try to extract value from AI response with improved regex patterns
      if (aiResponse && typeof aiResponse === 'object') {
        const aiStr = JSON.stringify(aiResponse);
        // Enhanced patterns to match:
        // - "R$ 100,00", "R$100", "R$ 1.234,56"
        // - "valor: 50", "value: 100", "valor de R$ 50"
        // - "valor_pix": 100, "payment_value": 50.00
        // - Standalone values like "97,00" or "1234.56" near keywords
        const valuePatterns = [
          /(?:valor|value|amount|payment_value|valor_pix|montante)[:\s"]*R?\$?\s*([\d.,]+)/gi,
          /R\$\s*([\d.,]+)/g,
          /(?:pagamento|pix|transferido|transferência|recebido)[^0-9]{0,30}([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{2}))/gi,
          /(?:total|quantia)[:\s]*R?\$?\s*([\d.,]+)/gi,
        ];
        
        let bestValue: number | null = null;
        
        for (const pattern of valuePatterns) {
          const matches = [...aiStr.matchAll(pattern)];
          for (const match of matches) {
            if (match[1]) {
              // Clean the value: remove dots (thousand separator), replace comma with dot
              const cleanedValue = match[1].replace(/\./g, '').replace(',', '.');
              const parsed = parseFloat(cleanedValue);
              if (!isNaN(parsed) && parsed > 0 && parsed < 1000000) {
                // Prefer higher values (more likely to be the actual payment)
                if (bestValue === null || parsed > bestValue) {
                  bestValue = parsed;
                }
              }
            }
          }
        }
        
        extractedValue = bestValue;
      }
      console.log("[TAG-WHATS] Extracted PIX value:", extractedValue);
    }

    // Check if conversion tracking is enabled (support both old and new formats)
    const adAccountIds = (config.selected_ad_account_ids && config.selected_ad_account_ids.length > 0) 
      ? config.selected_ad_account_ids 
      : (config.ad_account_id ? [config.ad_account_id] : []);
    const shouldTrackConversion = isPixPayment && labelApplied && config.enable_conversion_tracking && adAccountIds.length > 0;

    if (shouldTrackConversion) {
      console.log("[TAG-WHATS] ====== STARTING FACEBOOK CONVERSION TRACKING ======");
      console.log("[TAG-WHATS] Config:", { 
        enable_conversion_tracking: config.enable_conversion_tracking,
        ad_account_ids: adAccountIds,
        phone: phone,
        ctwaClid: ctwaClid
      });
      
      try {
        // Get lead info for ad_account_id prioritization
        const { data: lead } = await supabase
          .from("ads_whatsapp_leads")
          .select("ad_account_id")
          .eq("phone", phone)
          .eq("user_id", instance.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // If lead has ad_account_id, prioritize it for conversion tracking
        const leadAdAccountId = lead?.ad_account_id;
        const finalAdAccountIds = leadAdAccountId 
          ? [leadAdAccountId] 
          : adAccountIds;
        
        console.log("[TAG-WHATS] Final ad account IDs for conversion:", finalAdAccountIds);

        // Hash the phone number for privacy (SHA-256)
        const encoder = new TextEncoder();
        const phoneBuffer = encoder.encode(phone.toLowerCase().trim());
        const hashBuffer = await crypto.subtle.digest("SHA-256", phoneBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedPhone = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        console.log("[TAG-WHATS] Phone hashed for privacy");

        // Send conversion to all configured ad accounts (prioritize lead's ad_account_id if available)
        for (const adAccountDbId of finalAdAccountIds) {
          console.log("[TAG-WHATS] Processing ad account:", adAccountDbId);
          
          // Get the ad account with Facebook credentials
          const { data: adAccount, error: adAccountError } = await supabase
            .from("ads_ad_accounts")
            .select("*, ads_facebook_accounts(*)")
            .eq("id", adAccountDbId)
            .single();

          if (adAccountError || !adAccount) {
            console.error("[TAG-WHATS] Ad account not found:", adAccountError);
            conversionError = "Ad account not found";
            continue;
          }

          const accessToken = adAccount.ads_facebook_accounts?.access_token;
          console.log("[TAG-WHATS] Ad account found:", {
            ad_account_id: adAccount.ad_account_id,
            name: adAccount.name,
            hasAccessToken: !!accessToken
          });
          
          if (!accessToken) {
            console.error("[TAG-WHATS] No access token found for Facebook account");
            conversionError = "No access token";
            continue;
          }

          // Get the SELECTED pixel from the database
          const { data: selectedPixel, error: pixelError } = await supabase
            .from("ads_pixels")
            .select("pixel_id, name")
            .eq("ad_account_id", adAccountDbId)
            .eq("is_selected", true)
            .maybeSingle();

          let pixelId: string | null = null;
          let pixelName: string | null = null;

          if (selectedPixel) {
            pixelId = selectedPixel.pixel_id;
            pixelName = selectedPixel.name;
            console.log("[TAG-WHATS] Using selected pixel from DB:", { pixelId, name: pixelName });
          } else {
            // Fallback: try to fetch first pixel from Facebook if none selected
            console.log("[TAG-WHATS] No pixel selected in DB, fetching from Facebook...");
            const pixelUrl = `https://graph.facebook.com/v21.0/act_${adAccount.ad_account_id}/adspixels?fields=id,name&access_token=${accessToken}`;
            
            const pixelResponse = await fetch(pixelUrl);
            const pixelData = await pixelResponse.json();

            if (pixelData.error || !pixelData.data || pixelData.data.length === 0) {
              console.error("[TAG-WHATS] Pixel fetch error:", pixelData.error || "No pixels found");
              conversionError = pixelData.error?.message || "No pixel found for this ad account. Selecione um pixel na configuração.";
              continue;
            }
            pixelId = pixelData.data[0].id;
            pixelName = pixelData.data[0].name;
            console.log("[TAG-WHATS] Using first pixel from Facebook (fallback):", { pixelId, name: pixelName });
          }

          if (!pixelId) {
            console.error("[TAG-WHATS] No pixel ID available");
            conversionError = "No pixel configured";
            continue;
          }

          // Prepare event data according to Meta Conversions API spec
          const eventTime = Math.floor(Date.now() / 1000);
          const eventId = `tagwhats_${Date.now()}_${phone.slice(-4)}_${adAccount.ad_account_id}`;
          
          const eventData: any = {
            event_name: "Purchase",
            event_time: eventTime,
            event_id: eventId,
            action_source: "website",
            user_data: {
              ph: [hashedPhone],
            },
            custom_data: {
              currency: "BRL",
              value: extractedValue || 0,
              content_name: "PIX Payment via Tag Whats",
            },
          };

          // Add click IDs for better attribution per Meta documentation
          // fbc format: fb.1.{timestamp}.{fbclid}
          if (fbclid) {
            eventData.user_data.fbc = `fb.1.${Date.now()}.${fbclid}`;
            console.log("[TAG-WHATS] Added fbc parameter");
          }
          
          // For Click-to-WhatsApp attribution, use ctwa_clid
          if (ctwaClid) {
            // ctwa_clid goes in the custom_data for attribution tracking
            eventData.custom_data.ctwa_clid = ctwaClid;
            console.log("[TAG-WHATS] Added ctwa_clid for CTWA attribution");
          }

          console.log("[TAG-WHATS] Event data prepared:", JSON.stringify(eventData, null, 2));

          // Send event to Facebook Conversions API
          const eventsUrl = `https://graph.facebook.com/v21.0/${pixelId}/events`;
          console.log("[TAG-WHATS] Sending to Conversions API:", eventsUrl);
          
          const eventsResponse = await fetch(eventsUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: [eventData],
              access_token: accessToken,
            }),
          });

          const eventsResult = await eventsResponse.json();
          console.log("[TAG-WHATS] Conversions API response:", JSON.stringify(eventsResult));

          if (eventsResult.error) {
            console.error("[TAG-WHATS] Conversions API error:", eventsResult.error);
            conversionError = eventsResult.error.message || "Conversion API error";
          } else {
            console.log("[TAG-WHATS] ✅ Conversion event sent successfully to", adAccount.name);
            console.log("[TAG-WHATS] Events received:", eventsResult.events_received);
            conversionSent = true;
            conversionEventId = eventId;
          }
        }
      } catch (convError) {
        console.error("[TAG-WHATS] Error in conversion tracking:", convError);
        conversionError = convError instanceof Error ? convError.message : String(convError);
      }
      
      console.log("[TAG-WHATS] ====== CONVERSION TRACKING COMPLETE ======", {
        conversionSent,
        conversionEventId,
        conversionError
      });
    }

    // Log the result - we'll update fb_event_status after attempting to send
    const { data: logRecord, error: logInsertError } = await supabase.from("tag_whats_logs").insert({
      user_id: instance.user_id,
      config_id: config.id,
      instance_id: instance.id,
      contact_phone: phone,
      message_type: messageType,
      is_pix_payment: isPixPayment,
      label_applied: labelApplied,
      ai_response: aiResponse,
      conversion_sent: conversionSent,
      conversion_event_id: conversionEventId,
      conversion_error: conversionError,
      ctwa_clid: ctwaClid,
      extracted_value: extractedValue,
      error_message: errorMessage,
      fb_event_status: 'pending',
    }).select('id').single();

    const logId = logRecord?.id;

    // Send Facebook events to user's configured pixels when a sale is detected
    if (isPixPayment && (labelApplied || (config.disable_label_on_charge && config.auto_charge_enabled))) {
      console.log("[TAG-WHATS] ====== SENDING FB EVENTS TO USER PIXELS ======");
      
      try {
        // Get user's profile to check FB event settings
        const { data: userProfile, error: profileError } = await supabase
          .from("profiles")
          .select("fb_event_enabled, fb_event_on_sale, fb_event_value")
          .eq("id", instance.user_id)
          .single();

        if (profileError) {
          console.error("[TAG-WHATS] Error fetching user profile for FB events:", profileError);
        } else if (userProfile?.fb_event_enabled) {
          const eventType = userProfile.fb_event_on_sale || "Purchase";
          // Use configured value if set, otherwise use extracted value from AI
          const eventValue = userProfile.fb_event_value ?? extractedValue ?? 0;
          console.log("[TAG-WHATS] FB events enabled, event type:", eventType, "value:", eventValue);

          // Get all user's active pixels
          const { data: userPixels, error: pixelsError } = await supabase
            .from("user_facebook_pixels")
            .select("*")
            .eq("user_id", instance.user_id)
            .eq("is_active", true);

          if (pixelsError || !userPixels || userPixels.length === 0) {
            console.log("[TAG-WHATS] No active user pixels configured");
            // Update log status to pending (no pixels)
            if (logId) {
              await supabase.from("tag_whats_logs").update({
                fb_event_status: 'pending',
                fb_event_error: 'Nenhum pixel configurado',
              }).eq('id', logId);
            }
          } else {
            console.log(`[TAG-WHATS] Found ${userPixels.length} active pixels to try (retry logic enabled)`);

            // Hash phone for FB
            const hashPhoneForFb = async (phoneNumber: string): Promise<string> => {
              const encoder = new TextEncoder();
              const dataBuffer = encoder.encode(phoneNumber.toLowerCase().trim());
              const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
            };

            const hashedPhoneForPixels = await hashPhoneForFb(phone);

            // TRY ALL PIXELS UNTIL ONE SUCCEEDS (Retry Logic)
            let eventSentSuccessfully = false;
            let successfulPixelId: string | null = null;
            let lastError: string | null = null;
            let allPixelsFailed = true;

            for (const pixel of userPixels) {
              if (eventSentSuccessfully) break; // Stop once we succeed
              
              try {
                // Determine action_source based on whether we have page_id (Business Messaging)
                const isBusinessMessaging = !!pixel.page_id && !!ctwaClid;
                const actionSource = isBusinessMessaging ? "business_messaging" : "website";
                
                console.log(`[TAG-WHATS] Trying pixel ${pixel.pixel_id}, page_id: ${pixel.page_id || 'none'}, action_source: ${actionSource}`);

                const eventData: any = {
                  event_name: eventType,
                  event_time: Math.floor(Date.now() / 1000),
                  action_source: actionSource,
                  user_data: {
                    ph: [hashedPhoneForPixels],
                  },
                };

                // Business Messaging (WhatsApp) payload: page_id + ctwa_clid
                if (isBusinessMessaging) {
                  eventData.messaging_channel = "whatsapp";
                  eventData.user_data.page_id = pixel.page_id;
                  eventData.user_data.ctwa_clid = ctwaClid;
                  console.log(`[TAG-WHATS] Using Business Messaging with page_id: ${pixel.page_id}, ctwa_clid: ${ctwaClid}`);
                } else if (ctwaClid) {
                  // Fallback to fbp for attribution
                  eventData.user_data.fbp = ctwaClid;
                }

                // Add custom_data for Purchase events
                if (eventType === "Purchase" || eventType === "InitiateCheckout" || eventType === "AddToCart") {
                  eventData.custom_data = {
                    currency: "BRL",
                    value: eventValue,
                  };
                }

                const pixelEventsUrl = `https://graph.facebook.com/v21.0/${pixel.pixel_id}/events`;
                const pixelResponse = await fetch(pixelEventsUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    data: [eventData],
                    access_token: pixel.access_token,
                  }),
                });

                const pixelResult = await pixelResponse.json();
                
                console.log(`[TAG-WHATS] Pixel ${pixel.pixel_id} response:`, JSON.stringify(pixelResult));

                if (pixelResult.error) {
                  // Check for specific error subcodes
                  const subcode = pixelResult.error.error_subcode;
                  if (subcode === 2804024) {
                    lastError = "Lead não veio da mesma página do pixel";
                    console.log(`[TAG-WHATS] Pixel ${pixel.pixel_id}: page_id mismatch, trying next pixel...`);
                  } else if (subcode === 2804003) {
                    lastError = "ctwa_clid inválido ou expirado";
                    console.log(`[TAG-WHATS] Pixel ${pixel.pixel_id}: ctwa_clid invalid, trying next pixel...`);
                  } else {
                    lastError = pixelResult.error.message || "Erro desconhecido";
                  }
                  console.error(`[TAG-WHATS] Pixel ${pixel.pixel_id} error:`, pixelResult.error);
                } else {
                  // SUCCESS!
                  eventSentSuccessfully = true;
                  successfulPixelId = pixel.pixel_id;
                  allPixelsFailed = false;
                  console.log(`[TAG-WHATS] ✅ Event sent successfully to pixel ${pixel.pixel_id}:`, pixelResult.events_received);
                }
              } catch (pixelErr) {
                console.error(`[TAG-WHATS] Exception sending to pixel ${pixel.pixel_id}:`, pixelErr);
                lastError = pixelErr instanceof Error ? pixelErr.message : "Erro de conexão";
              }
            }

            // Update log with final status
            if (logId) {
              if (eventSentSuccessfully) {
                await supabase.from("tag_whats_logs").update({
                  fb_event_status: 'sent',
                  fb_event_pixel_id: successfulPixelId,
                  fb_event_error: null,
                }).eq('id', logId);
                console.log(`[TAG-WHATS] Log updated: event sent via pixel ${successfulPixelId}`);
              } else {
                await supabase.from("tag_whats_logs").update({
                  fb_event_status: 'failed',
                  fb_event_pixel_id: null,
                  fb_event_error: lastError || "Todos os pixels falharam",
                }).eq('id', logId);
                console.log(`[TAG-WHATS] Log updated: all pixels failed, error: ${lastError}`);
              }
            }

            // Log to facebook_event_logs so it appears in contact history
            try {
              // Find the inbox_contact by phone
              const { data: inboxContact } = await supabase
                .from("inbox_contacts")
                .select("id")
                .eq("phone", phone)
                .eq("user_id", instance.user_id)
                .limit(1)
                .maybeSingle();

              if (inboxContact) {
                // Find the successful pixel to get its page_id
                const successfulPixel = userPixels.find(p => p.pixel_id === successfulPixelId);
                
                await supabase.from("facebook_event_logs").insert({
                  user_id: instance.user_id,
                  contact_id: inboxContact.id,
                  phone: phone,
                  pixel_id: successfulPixelId || userPixels[0]?.pixel_id || 'unknown',
                  page_id: successfulPixel?.page_id || null,
                  event_name: eventType,
                  event_value: eventValue,
                  action_source: eventSentSuccessfully && ctwaClid ? 'business_messaging' : 'website',
                  success: eventSentSuccessfully,
                  error_message: eventSentSuccessfully ? null : lastError,
                  ctwa_clid: ctwaClid || null,
                });
                console.log(`[TAG-WHATS] Event logged to facebook_event_logs for contact ${inboxContact.id}, page_id: ${successfulPixel?.page_id}, value: ${eventValue}`);
              }
            } catch (logErr) {
              console.error(`[TAG-WHATS] Error logging to facebook_event_logs:`, logErr);
            }
          }
        } else {
          console.log("[TAG-WHATS] FB events not enabled for user");
        }
      } catch (fbEventError) {
        console.error("[TAG-WHATS] Error sending FB events:", fbEventError);
        // Don't fail the main process for FB event errors
      }

      console.log("[TAG-WHATS] ====== FB EVENTS COMPLETE ======");
    }

    // Send push notification for sales if enabled - ONLY to the instance owner
    if (isPixPayment && labelApplied) {
      console.log("[TAG-WHATS] Queueing sale notification for instance owner...");
      
      try {
        // FIXED: Only notify the instance owner (instance.user_id), not all users
        const { data: ownerProfile, error: ownerError } = await supabase
          .from("profiles")
          .select("id, push_subscription_ids, notify_on_sale, push_webhook_enabled")
          .eq("id", instance.user_id)
          .single();

        if (ownerError) {
          console.error("[TAG-WHATS] Error fetching instance owner profile:", ownerError);
        } else if (ownerProfile) {
          console.log(`[TAG-WHATS] Owner profile found:`, {
            user_id: ownerProfile.id,
            notify_on_sale: ownerProfile.notify_on_sale,
            push_enabled: ownerProfile.push_webhook_enabled,
            has_subscriptions: !!(ownerProfile.push_subscription_ids?.length)
          });
          
          // Check if owner has sale notifications enabled
          if (ownerProfile.notify_on_sale && 
              ownerProfile.push_webhook_enabled && 
              ownerProfile.push_subscription_ids && 
              Array.isArray(ownerProfile.push_subscription_ids) && 
              ownerProfile.push_subscription_ids.length > 0) {
            
            const { error: insertError } = await supabase
              .from("push_notification_queue")
              .insert({
                user_id: ownerProfile.id,
                subscription_ids: ownerProfile.push_subscription_ids,
                title: "💰 Nova Venda!",
                message: extractedValue ? `Pix Pago! Valor: R$ ${extractedValue.toFixed(2)} 🔥` : "Pix Pago no x1! 🔥",
                icon_url: "https://zapdata.com.br/favicon.png",
              });
            
            if (insertError) {
              console.error("[TAG-WHATS] Error inserting sale notification to queue:", insertError);
            } else {
              console.log(`[TAG-WHATS] Sale notification queued for instance owner ${ownerProfile.id}`);
            }
          } else {
            console.log("[TAG-WHATS] Instance owner does not have sale notifications enabled or no subscription IDs");
          }
        }
      } catch (pushError) {
        console.error("[TAG-WHATS] Error queueing sale push notification:", pushError);
        // Don't fail the main process for push notification errors
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_pix_payment: isPixPayment,
        label_applied: labelApplied,
        conversion_sent: conversionSent,
        conversion_event_id: conversionEventId,
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
