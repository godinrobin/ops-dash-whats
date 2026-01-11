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

// Alternative: Use pdfjs-dist for actual text extraction
async function extractPdfTextWithPdfJs(base64Data: string): Promise<string> {
  try {
    console.log("[TAG-WHATS] Attempting PDF text extraction with alternative method...");
    
    // Use Lovable AI (Gemini) which supports PDFs natively
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      console.log("[TAG-WHATS] No LOVABLE_API_KEY, falling back to basic extraction");
      return await extractPdfText(base64Data);
    }
    
    // Gemini 2.5 Flash supports PDF documents natively
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Você é um extrator de texto de documentos PDF. Extraia TODO o texto visível do documento PDF fornecido, mantendo a estrutura original o máximo possível. Retorne apenas o texto extraído, sem comentários adicionais."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraia todo o texto deste documento PDF:"
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64Data}`
                }
              }
            ]
          }
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[TAG-WHATS] Lovable AI extraction error:", errorText);
      return await extractPdfText(base64Data);
    }
    
    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content || "";
    
    console.log("[TAG-WHATS] Extracted text from PDF (preview):", extractedText.substring(0, 500));
    
    return extractedText;
  } catch (error) {
    console.error("[TAG-WHATS] PDF text extraction with Lovable AI failed:", error);
    return await extractPdfText(base64Data);
  }
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
    
    if (isPdf) {
      // For PDFs: Extract text first, then analyze with GPT
      console.log("[TAG-WHATS] PDF detected - extracting text first...");
      
      const extractedText = await extractPdfTextWithPdfJs(mediaBase64);
      console.log("[TAG-WHATS] PDF text extracted, length:", extractedText.length);
      
      // Now analyze the extracted text with GPT
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
              content: `Analise o seguinte texto extraído de um documento PDF e determine se é um comprovante de pagamento PIX:\n\n---\n${extractedText}\n---`,
            },
          ],
          max_tokens: 200,
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error("[TAG-WHATS] OpenAI error (PDF text analysis):", errorText);
        
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
      aiContent = aiResult.choices?.[0]?.message?.content || "";
      
    } else {
      // For images: Use GPT-4 Vision directly
      const imageDataUrl = `data:${mediaMimetype};base64,${mediaBase64}`;
      console.log("[TAG-WHATS] Sending image to OpenAI for analysis. Data URL length:", imageDataUrl.length);

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
                    url: imageDataUrl,
                    detail: "low",
                  },
                },
                {
                  type: "text",
                  text: "Analise esta imagem e determine se é um comprovante de pagamento PIX.",
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
      aiContent = aiResult.choices?.[0]?.message?.content || "";
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
        console.log("[TAG-WHATS] First time - applying label...");

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
          const labelPayload = {
            number: phone,
            add_labelid: pagoLabelId,
          };
          console.log("[TAG-WHATS] Applying label with payload:", JSON.stringify(labelPayload));
          console.log("[TAG-WHATS] API URL:", `${uazapiBaseUrl}/chat/labels`);
          
          const labelResponse = await fetch(`${uazapiBaseUrl}/chat/labels`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "token": uazapiToken,
            },
            body: JSON.stringify(labelPayload),
          });

          const labelResponseText = await labelResponse.text();
          console.log("[TAG-WHATS] Label API response status:", labelResponse.status);
          console.log("[TAG-WHATS] Label API response:", labelResponseText);

          if (labelResponse.ok) {
            labelApplied = true;
            console.log("[TAG-WHATS] Label applied successfully!");
          } else {
            console.error("[TAG-WHATS] Failed to apply label. Status:", labelResponse.status, "Response:", labelResponseText);
            errorMessage = `Failed to apply label: ${labelResponseText}`;
          }
        } else {
          console.log("[TAG-WHATS] No 'Pago' label found. Please create it in WhatsApp Business first.");
          errorMessage = "No 'Pago' label configured - create it in WhatsApp Business";
        }
      } // Close !alreadyHasLabel
    } // Close isPixPayment

    // Facebook Conversion Tracking
    let conversionSent = false;
    let conversionEventId: string | null = null;
    let conversionError: string | null = null;
    let ctwaClid: string | null = null;
    let extractedValue: number | null = null;

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
        phone: phone
      });
      
      try {
        // Try to get ctwa_clid from ads_whatsapp_leads to identify which ad account originated the lead
        const { data: lead, error: leadError } = await supabase
          .from("ads_whatsapp_leads")
          .select("ctwa_clid, fbclid, ad_account_id")
          .eq("phone", phone)
          .eq("user_id", instance.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        console.log("[TAG-WHATS] Lead lookup:", { 
          found: !!lead, 
          ctwa_clid: lead?.ctwa_clid, 
          fbclid: lead?.fbclid,
          ad_account_id: lead?.ad_account_id,
          error: leadError?.message 
        });

        ctwaClid = lead?.ctwa_clid || null;
        const fbclid = lead?.fbclid || null;
        
        // If lead has ad_account_id, prioritize it for conversion tracking
        const leadAdAccountId = lead?.ad_account_id;
        const finalAdAccountIds = leadAdAccountId 
          ? [leadAdAccountId] 
          : adAccountIds;
        
        console.log("[TAG-WHATS] Final ad account IDs for conversion:", finalAdAccountIds);

        // Try to extract value from AI response
        if (aiResponse && typeof aiResponse === 'object') {
          const aiStr = JSON.stringify(aiResponse);
          // Match patterns like "R$ 100,00", "R$100", "100,00", "valor: 50"
          const valueMatch = aiStr.match(/R\$?\s*([\d.,]+)|valor[:\s]+([\d.,]+)/i);
          if (valueMatch) {
            const valueStr = (valueMatch[1] || valueMatch[2]).replace(/\./g, '').replace(',', '.');
            extractedValue = parseFloat(valueStr);
            if (isNaN(extractedValue)) extractedValue = null;
          }
        }
        console.log("[TAG-WHATS] Extracted value:", extractedValue);

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
      conversion_sent: conversionSent,
      conversion_event_id: conversionEventId,
      conversion_error: conversionError,
      ctwa_clid: ctwaClid,
      extracted_value: extractedValue,
      error_message: errorMessage,
    });

    // Send push notification for sales if enabled
    if (isPixPayment && labelApplied) {
      console.log("[TAG-WHATS] Sending sale notification...");
      
      try {
        // Get all users who have notify_on_sale enabled AND have push enabled with subscription IDs
        const { data: usersToNotify, error: usersError } = await supabase
          .from("profiles")
          .select("id, push_subscription_ids")
          .eq("notify_on_sale", true)
          .eq("push_webhook_enabled", true)
          .not("push_subscription_ids", "is", null);

        if (usersError) {
          console.error("[TAG-WHATS] Error fetching users to notify:", usersError);
        } else if (usersToNotify && usersToNotify.length > 0) {
          console.log(`[TAG-WHATS] Found ${usersToNotify.length} users to notify about sale`);
          
          // Get OneSignal credentials
          const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
          const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
          
          if (ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY) {
            // Collect all subscription IDs from all users
            const allSubscriptionIds: string[] = [];
            for (const user of usersToNotify) {
              const ids = user.push_subscription_ids || [];
              if (Array.isArray(ids)) {
                allSubscriptionIds.push(...ids);
              }
            }
            
            if (allSubscriptionIds.length > 0) {
              console.log(`[TAG-WHATS] Sending push to ${allSubscriptionIds.length} device(s)`);
              
              const onesignalPayload = {
                app_id: ONESIGNAL_APP_ID,
                include_subscription_ids: allSubscriptionIds,
                headings: { pt: "💰 Nova Venda!", en: "💰 New Sale!" },
                contents: { pt: "Pix Pago no x1! 🔥", en: "Pix Paid on x1! 🔥" },
                chrome_web_icon: "https://zapdata.com.br/favicon.png",
                firefox_icon: "https://zapdata.com.br/favicon.png",
                data: {
                  event_type: "sale_notification",
                  phone: phone,
                  value: extractedValue,
                  timestamp: new Date().toISOString(),
                },
              };
              
              const onesignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json; charset=utf-8",
                  "Authorization": `Key ${ONESIGNAL_REST_API_KEY}`,
                },
                body: JSON.stringify(onesignalPayload),
              });
              
              const osResult = await onesignalResponse.json();
              console.log("[TAG-WHATS] Push notification result:", osResult);
            }
          } else {
            console.log("[TAG-WHATS] OneSignal credentials not configured, skipping push");
          }
        } else {
          console.log("[TAG-WHATS] No users have sale notifications enabled");
        }
      } catch (pushError) {
        console.error("[TAG-WHATS] Error sending sale push notification:", pushError);
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
