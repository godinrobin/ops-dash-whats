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

    const systemPrompt = `Você é um especialista em análise de comprovantes de pagamento PIX do Brasil.

TAREFA: Analise a imagem/documento e extraia TODAS as informações do comprovante PIX.

RESPONDA OBRIGATORIAMENTE com JSON neste formato EXATO:
{
  "is_pix_payment": true/false,
  "confidence": 0-100,
  "reason": "breve explicação",
  "valor": "valor exato encontrado no comprovante (ex: 97.00, 150.50, 1234.00) - use ponto como separador decimal",
  "valor_texto": "valor exatamente como aparece no comprovante (ex: R$ 97,00)",
  "destinatario_nome": "nome completo do destinatário/recebedor do PIX",
  "destinatario_cpf_cnpj": "CPF ou CNPJ do destinatário (apenas números, ou null se não visível)"
}

COMO IDENTIFICAR O VALOR DO PIX:
1. Procure por "Valor" ou "Value" seguido de R$ ou número
2. Procure por "R$" seguido de números (ex: R$ 97,00 → valor: 97.00)
3. O valor geralmente aparece em destaque ou maior fonte
4. Em comprovantes bancários, procure linha "Valor da transferência" ou "Valor Pix"
5. Formatos comuns: "R$ 100,00", "100,00", "R$100", "BRL 100.00"

REGRAS DE CONVERSÃO:
- "R$ 97,00" → valor: 97.00
- "R$ 1.234,56" → valor: 1234.56 (ponto é milhar, vírgula é decimal)
- Se o valor contém apenas vírgula: substitua por ponto (97,00 → 97.00)
- Se não encontrar valor, retorne valor: null

COMO IDENTIFICAR O DESTINATÁRIO:
1. Procure por "Destino", "Destinatário", "Recebedor", "Favorecido", "Para"
2. O nome do destinatário geralmente aparece junto com CPF/CNPJ parcial ou completo
3. Extraia o nome EXATAMENTE como aparece no comprovante
4. CPF/CNPJ pode estar parcialmente mascarado (ex: ***.123.456-**) - extraia o que for visível, remova os asteriscos
5. Se não encontrar, retorne null

CRITÉRIOS PARA PIX VÁLIDO:
- Presença de "Pix", "Transferência Pix", "Comprovante" 
- Dados de origem/destino (nome, CPF/CNPJ, banco)
- Valor da transação (OBRIGATÓRIO extrair)
- Data/hora e código de autenticação

Se não for PIX ou imagem não for clara, retorne is_pix_payment: false.`;

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
    let fakeReceiptDetected = false;

    if (isPixPayment) {
      console.log("[TAG-WHATS] PIX payment detected! Checking fake receipt detection...");
      
      // Check if fake receipt detection is enabled for this user
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("fake_receipt_detection_enabled")
        .eq("id", instance.user_id)
        .single();
      
      if (userProfile?.fake_receipt_detection_enabled) {
        console.log("[TAG-WHATS] Fake receipt detection is enabled. Checking recipients...");
        
        // Get registered recipients for this user
        const { data: recipients } = await supabase
          .from("tag_whats_recipients")
          .select("name, cpf_cnpj")
          .eq("user_id", instance.user_id);
        
        if (recipients && recipients.length > 0) {
          const extractedName = (aiResponse?.destinatario_nome || "").toLowerCase().trim();
          const extractedCpfCnpj = (aiResponse?.destinatario_cpf_cnpj || "").replace(/\D/g, "");
          
          console.log("[TAG-WHATS] Extracted recipient data:", { extractedName, extractedCpfCnpj });
          console.log("[TAG-WHATS] Registered recipients:", recipients.length);
          
          // Check if the extracted recipient matches any registered recipient
          const matchFound = recipients.some(r => {
            const registeredName = r.name.toLowerCase().trim();
            const registeredCpfCnpj = r.cpf_cnpj.replace(/\D/g, "");
            
            // Match by name (partial match - check if extracted name contains registered name or vice versa)
            const nameMatch = extractedName.includes(registeredName) || 
                              registeredName.includes(extractedName) ||
                              extractedName.split(" ").some((word: string) => registeredName.includes(word) && word.length > 2);
            
            // Match by CPF/CNPJ (partial match - for masked documents)
            const cpfCnpjMatch = extractedCpfCnpj && registeredCpfCnpj && (
              extractedCpfCnpj.includes(registeredCpfCnpj) || 
              registeredCpfCnpj.includes(extractedCpfCnpj) ||
              // Handle partial CPF/CNPJ (at least 6 consecutive digits match)
              (extractedCpfCnpj.length >= 6 && registeredCpfCnpj.includes(extractedCpfCnpj)) ||
              (registeredCpfCnpj.length >= 6 && extractedCpfCnpj.includes(registeredCpfCnpj))
            );
            
            console.log("[TAG-WHATS] Checking recipient:", { 
              registeredName, 
              registeredCpfCnpj: registeredCpfCnpj.slice(0, 3) + "***",
              nameMatch, 
              cpfCnpjMatch 
            });
            
            return nameMatch || cpfCnpjMatch;
          });
          
          if (!matchFound) {
            console.log("[TAG-WHATS] FAKE RECEIPT DETECTED! Recipient does not match any registered recipient.");
            fakeReceiptDetected = true;
            
            // Log the fake receipt detection
            await supabase.from("tag_whats_logs").insert({
              user_id: instance.user_id,
              config_id: config.id,
              instance_id: instance.id,
              contact_phone: phone,
              message_type: messageType,
              is_pix_payment: true,
              label_applied: false,
              error_message: `Comprovante fake detectado! Destinatário: "${aiResponse?.destinatario_nome || 'não identificado'}" não corresponde a nenhum recebedor cadastrado.`,
            });
            
            return new Response(JSON.stringify({ 
              success: true, 
              message: "Fake receipt detected - recipient mismatch",
              fake_detected: true,
              extracted_recipient: aiResponse?.destinatario_nome,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } else {
            console.log("[TAG-WHATS] Recipient verified successfully!");
          }
        } else {
          console.log("[TAG-WHATS] No recipients registered, skipping validation.");
        }
      }
      
      console.log("[TAG-WHATS] Checking if already labeled...");
      
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

      // IMPROVED: First try to extract value directly from aiResponse.valor field
      if (aiResponse && typeof aiResponse === 'object') {
        // Priority 1: Check if AI returned valor field directly
        if (aiResponse.valor !== null && aiResponse.valor !== undefined) {
          const directValue = parseFloat(String(aiResponse.valor).replace(',', '.'));
          if (!isNaN(directValue) && directValue > 0 && directValue < 1000000) {
            extractedValue = directValue;
            console.log("[TAG-WHATS] ✅ Value extracted from AI.valor field:", extractedValue);
          }
        }
        
        // Priority 2: Try to parse valor_texto field
        if (!extractedValue && aiResponse.valor_texto) {
          const valorTexto = String(aiResponse.valor_texto);
          // Clean: "R$ 97,00" → "97.00"
          const cleaned = valorTexto
            .replace(/R\$?\s*/gi, '')
            .replace(/\./g, '')  // Remove thousand separators
            .replace(',', '.')   // Convert decimal comma to dot
            .trim();
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && parsed > 0 && parsed < 1000000) {
            extractedValue = parsed;
            console.log("[TAG-WHATS] ✅ Value extracted from AI.valor_texto:", extractedValue, "from:", valorTexto);
          }
        }
        
        // Priority 3: Fallback to regex patterns on full AI response
        if (!extractedValue) {
          const aiStr = JSON.stringify(aiResponse);
          const valuePatterns = [
            // Direct value patterns in JSON
            /"valor":\s*"?([\d.,]+)"?/gi,
            /"value":\s*"?([\d.,]+)"?/gi,
            /"amount":\s*"?([\d.,]+)"?/gi,
            // Currency patterns
            /R\$\s*([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{2}))/g,  // R$ 1.234,56
            /R\$\s*([\d]+(?:,[\d]{2})?)/g,                    // R$ 97,00 or R$ 97
            // Value keywords
            /(?:valor|value|total)[:\s]*R?\$?\s*([\d.,]+)/gi,
          ];
          
          let bestValue: number | null = null;
          
          for (const pattern of valuePatterns) {
            const matches = [...aiStr.matchAll(pattern)];
            for (const match of matches) {
              if (match[1]) {
                // Clean: remove dots (thousand sep), convert comma to dot
                const cleanedValue = match[1].replace(/\./g, '').replace(',', '.');
                const parsed = parseFloat(cleanedValue);
                if (!isNaN(parsed) && parsed > 0 && parsed < 1000000) {
                  if (bestValue === null || parsed > bestValue) {
                    bestValue = parsed;
                  }
                }
              }
            }
          }
          
          if (bestValue) {
            extractedValue = bestValue;
            console.log("[TAG-WHATS] ✅ Value extracted from regex fallback:", extractedValue);
          }
        }
      }
      
      // Priority 4: If still no value and we have media, make a dedicated Gemini call for value extraction
      if (!extractedValue && mediaBase64 && isPixPayment) {
        console.log("[TAG-WHATS] 🔍 No value found, making dedicated Gemini call for value extraction...");
        
        const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
        if (lovableApiKey) {
          try {
            const valueExtractionPrompt = `Extraia APENAS o valor monetário deste comprovante de pagamento PIX.

RESPONDA SOMENTE COM O NÚMERO DO VALOR, usando ponto como decimal.
Exemplos de resposta correta: 97.00, 150.50, 1234.00, 50.00

Se o comprovante mostrar "R$ 97,00", responda: 97.00
Se o comprovante mostrar "R$ 1.234,56", responda: 1234.56
Se não encontrar valor, responda: 0`;

            const valueResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${lovableApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: valueExtractionPrompt },
                      { type: "image_url", image_url: { url: `data:${mediaMimetype};base64,${mediaBase64}` } }
                    ]
                  }
                ],
              }),
            });

            if (valueResponse.ok) {
              const valueResult = await valueResponse.json();
              const valueContent = valueResult.choices?.[0]?.message?.content || "";
              console.log("[TAG-WHATS] Gemini value extraction response:", valueContent);
              
              // Parse the numeric response
              const cleanedResponse = valueContent.trim().replace(/[^\d.,]/g, '').replace(',', '.');
              const geminiValue = parseFloat(cleanedResponse);
              
              if (!isNaN(geminiValue) && geminiValue > 0 && geminiValue < 1000000) {
                extractedValue = geminiValue;
                console.log("[TAG-WHATS] ✅ Value extracted from Gemini fallback:", extractedValue);
              }
            } else {
              console.log("[TAG-WHATS] Gemini value extraction failed:", await valueResponse.text());
            }
          } catch (geminiError) {
            console.error("[TAG-WHATS] Gemini value extraction error:", geminiError);
          }
        }
      }
      
      console.log("[TAG-WHATS] 📊 Final extracted PIX value:", extractedValue);
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

    // ====== SYNC TO ADS_WHATSAPP_LEADS FOR DASHBOARD (with URL Attribution) ======
    // When a PIX payment is detected, create or update ads_whatsapp_leads with proper ad attribution
    if (isPixPayment && labelApplied) {
      console.log("[TAG-WHATS] ====== SYNCING TO ADS_WHATSAPP_LEADS (URL Attribution) ======");
      
      try {
        // Get contact's ad_source_url from inbox_contacts for attribution
        const { data: inboxContact } = await supabase
          .from("inbox_contacts")
          .select("id, ad_source_url, ctwa_clid")
          .eq("phone", phone)
          .eq("user_id", instance.user_id)
          .eq("instance_id", instance.id)
          .limit(1)
          .maybeSingle();

        let adId: string | null = null;
        let adsetId: string | null = null;
        let campaignId: string | null = null;
        let matchedAdAccountId: string | null = null;
        const adSourceUrl = inboxContact?.ad_source_url;
        const contactCtwaClid = inboxContact?.ctwa_clid || ctwaClid;

        // ====== URL-based Attribution Logic ======
        if (adSourceUrl) {
          console.log(`[TAG-WHATS] Attempting URL attribution with ad_source_url: ${adSourceUrl}`);
          
          let expandedUrl = adSourceUrl;
          const postIdsToMatch: string[] = [];
          const urlsToMatch: string[] = [adSourceUrl];

          // Try to expand short links (fb.me, l.facebook.com, instagram.com/p/)
          try {
            const sourceUrlObj = new URL(adSourceUrl);
            const isShortLink = sourceUrlObj.hostname === 'fb.me' || 
                                sourceUrlObj.hostname === 'l.facebook.com' ||
                                sourceUrlObj.hostname === 'l.instagram.com' ||
                                (sourceUrlObj.hostname.includes('instagram.com') && sourceUrlObj.pathname.startsWith('/p/'));
            
            if (isShortLink) {
              console.log(`[TAG-WHATS] Detected short link, attempting to expand: ${adSourceUrl}`);
              
              // Method 1: HEAD request with manual redirect (faster)
              let expandSuccess = false;
              try {
                const headResponse = await fetch(adSourceUrl, { 
                  method: 'HEAD', 
                  redirect: 'manual',
                  headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                  }
                });
                const locationHeader = headResponse.headers.get('location');
                if (locationHeader) {
                  expandedUrl = locationHeader;
                  urlsToMatch.push(expandedUrl);
                  expandSuccess = true;
                  console.log(`[TAG-WHATS] Expanded via HEAD redirect: ${expandedUrl}`);
                }
              } catch (headErr) {
                console.log(`[TAG-WHATS] HEAD expand failed: ${headErr}`);
              }
              
              // Method 2: GET with follow (fallback)
              if (!expandSuccess) {
                try {
                  const getResponse = await fetch(adSourceUrl, { 
                    method: 'GET', 
                    redirect: 'follow',
                    headers: { 
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                  });
                  if (getResponse.url && getResponse.url !== adSourceUrl) {
                    expandedUrl = getResponse.url;
                    urlsToMatch.push(expandedUrl);
                    expandSuccess = true;
                    console.log(`[TAG-WHATS] Expanded via GET follow: ${expandedUrl}`);
                  }
                } catch (getErr) {
                  console.log(`[TAG-WHATS] GET expand failed: ${getErr}`);
                }
              }
              
              // Method 3: Parse short code from fb.me and try multiple formats
              if (!expandSuccess && sourceUrlObj.hostname === 'fb.me') {
                const shortCode = sourceUrlObj.pathname.replace('/', '');
                if (shortCode) {
                  // Add potential matching patterns
                  postIdsToMatch.push(shortCode);
                  urlsToMatch.push(`https://www.facebook.com/share/p/${shortCode}`);
                  urlsToMatch.push(`https://www.facebook.com/share/${shortCode}`);
                  console.log(`[TAG-WHATS] Added fb.me shortcode to match: ${shortCode}`);
                }
              }
            }
          } catch (urlParseErr) {
            console.log(`[TAG-WHATS] URL parse error: ${urlParseErr}`);
          }

          // Extract Facebook post components from URL
          try {
            const urlToAnalyze = new URL(expandedUrl);
            const pathname = urlToAnalyze.pathname;
            const searchParams = urlToAnalyze.searchParams;
            
            // Extract story_fbid from query params
            const storyFbid = searchParams.get('story_fbid');
            const postIdParam = searchParams.get('post_id');
            
            if (storyFbid) {
              postIdsToMatch.push(storyFbid);
              console.log(`[TAG-WHATS] Extracted story_fbid: ${storyFbid}`);
            }
            
            if (postIdParam) {
              const parts = postIdParam.split('_');
              if (parts.length === 2) {
                postIdsToMatch.push(parts[1]);
              }
              postIdsToMatch.push(postIdParam);
              console.log(`[TAG-WHATS] Extracted post_id: ${postIdParam}`);
            }
            
            // Match facebook.com/pageId/posts/postId pattern
            const postMatch = pathname.match(/\/(\d+)\/posts\/(\d+)/);
            if (postMatch) {
              const [, pageId, postId] = postMatch;
              urlsToMatch.push(`https://www.facebook.com/${pageId}/posts/${postId}`);
              postIdsToMatch.push(postId);
              console.log(`[TAG-WHATS] Extracted post pattern: pageId=${pageId}, postId=${postId}`);
            }
            
            // Match /p/{shortcode} pattern for Instagram
            const igMatch = pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
            if (igMatch) {
              postIdsToMatch.push(igMatch[1]);
              console.log(`[TAG-WHATS] Extracted Instagram shortcode: ${igMatch[1]}`);
            }
          } catch (parseErr) {
            console.log(`[TAG-WHATS] URL component extraction error: ${parseErr}`);
          }

          // Strategy 1: Match by post IDs in effective_object_story_id or ad_post_url
          for (const postId of postIdsToMatch) {
            if (campaignId) break;
            
            const { data: matchedAd } = await supabase
              .from('ads_ads')
              .select('ad_id, campaign_id, adset_id, name, ad_account_id')
              .eq('user_id', instance.user_id)
              .or(`effective_object_story_id.ilike.%${postId}%,ad_post_url.ilike.%${postId}%`)
              .limit(1)
              .maybeSingle();
            
            if (matchedAd) {
              adId = matchedAd.ad_id;
              campaignId = matchedAd.campaign_id;
              adsetId = matchedAd.adset_id;
              matchedAdAccountId = matchedAd.ad_account_id;
              console.log(`[TAG-WHATS] ✅ Matched ad by postId ${postId}: ad_id=${adId}, campaign_id=${campaignId}`);
            }
          }

          // Strategy 2: Match by cleaned URL
          if (!campaignId) {
            for (const urlToMatch of urlsToMatch) {
              if (campaignId) break;
              
              const cleanedUrl = urlToMatch.replace(/^https?:\/\/(www\.)?/, '').split('?')[0];
              
              const { data: matchedAd } = await supabase
                .from('ads_ads')
                .select('ad_id, campaign_id, adset_id, name, ad_account_id')
                .eq('user_id', instance.user_id)
                .ilike('ad_post_url', `%${cleanedUrl}%`)
                .limit(1)
                .maybeSingle();
              
              if (matchedAd) {
                adId = matchedAd.ad_id;
                campaignId = matchedAd.campaign_id;
                adsetId = matchedAd.adset_id;
                matchedAdAccountId = matchedAd.ad_account_id;
                console.log(`[TAG-WHATS] ✅ Matched ad by URL ${cleanedUrl}: ad_id=${adId}, campaign_id=${campaignId}`);
              }
            }
          }

          // Strategy 3: Prefix matching (first 10 digits of postId)
          if (!campaignId && postIdsToMatch.length > 0) {
            for (const postId of postIdsToMatch) {
              if (campaignId) break;
              if (postId.length < 10) continue;
              
              const prefix = postId.substring(0, 10);
              
              const { data: matchedAd } = await supabase
                .from('ads_ads')
                .select('ad_id, campaign_id, adset_id, name, ad_account_id')
                .eq('user_id', instance.user_id)
                .ilike('effective_object_story_id', `%${prefix}%`)
                .limit(1)
                .maybeSingle();
              
              if (matchedAd) {
                adId = matchedAd.ad_id;
                campaignId = matchedAd.campaign_id;
                adsetId = matchedAd.adset_id;
                matchedAdAccountId = matchedAd.ad_account_id;
                console.log(`[TAG-WHATS] ✅ Matched ad by prefix ${prefix}: ad_id=${adId}, campaign_id=${campaignId}`);
              }
            }
          }

          // Strategy 4: Match by fb.me shortcode in any ad URL or creative
          if (!campaignId) {
            try {
              const sourceUrlObj = new URL(adSourceUrl);
              if (sourceUrlObj.hostname === 'fb.me') {
                const shortCode = sourceUrlObj.pathname.replace('/', '');
                if (shortCode && shortCode.length >= 6) {
                  console.log(`[TAG-WHATS] Strategy 4: Searching by fb.me shortcode: ${shortCode}`);
                  
                  // Try to find any ad that contains this shortcode
                  const { data: matchedAd } = await supabase
                    .from('ads_ads')
                    .select('ad_id, campaign_id, adset_id, name, ad_account_id')
                    .eq('user_id', instance.user_id)
                    .or(`ad_post_url.ilike.%${shortCode}%,effective_object_story_id.ilike.%${shortCode}%`)
                    .limit(1)
                    .maybeSingle();
                  
                  if (matchedAd) {
                    adId = matchedAd.ad_id;
                    campaignId = matchedAd.campaign_id;
                    adsetId = matchedAd.adset_id;
                    matchedAdAccountId = matchedAd.ad_account_id;
                    console.log(`[TAG-WHATS] ✅ Matched ad by fb.me shortcode ${shortCode}: ad_id=${adId}, campaign_id=${campaignId}`);
                  }
                }
              }
            } catch (shortCodeErr) {
              console.log(`[TAG-WHATS] Strategy 4 error: ${shortCodeErr}`);
            }
          }

          // Strategy 5: Use ctwa_clid to lookup from ads_whatsapp_leads (other contacts from same ad)
          if (!campaignId && contactCtwaClid) {
            console.log(`[TAG-WHATS] Strategy 5: Looking up by ctwa_clid pattern`);
            
            // Extract first part of ctwa_clid (usually identifies the ad/campaign)
            const clidPrefix = contactCtwaClid.substring(0, 20);
            
            const { data: similarLead } = await supabase
              .from('ads_whatsapp_leads')
              .select('ad_id, campaign_id, adset_id, ad_account_id')
              .eq('user_id', instance.user_id)
              .not('campaign_id', 'is', null)
              .ilike('ctwa_clid', `${clidPrefix}%`)
              .limit(1)
              .maybeSingle();
            
            if (similarLead && similarLead.campaign_id) {
              adId = similarLead.ad_id;
              campaignId = similarLead.campaign_id;
              adsetId = similarLead.adset_id;
              matchedAdAccountId = similarLead.ad_account_id;
              console.log(`[TAG-WHATS] ✅ Matched via ctwa_clid similarity: ad_id=${adId}, campaign_id=${campaignId}`);
            }
          }

          if (!campaignId) {
            console.log(`[TAG-WHATS] No ad match found for URL: ${adSourceUrl}`);
          }
        } else {
          console.log("[TAG-WHATS] No ad_source_url found for contact, skipping URL attribution");
        }

        // Check if lead already exists for this phone
        const { data: existingLead, error: leadCheckError } = await supabase
          .from("ads_whatsapp_leads")
          .select("id, purchase_sent_at, ad_id, campaign_id")
          .eq("phone", phone)
          .eq("user_id", instance.user_id)
          .maybeSingle();

        if (leadCheckError) {
          console.error("[TAG-WHATS] Error checking existing lead:", leadCheckError);
        } else if (existingLead) {
          // Update existing lead with purchase info and attribution if not already set
          const updateData: any = {
            purchase_sent_at: new Date().toISOString(),
            purchase_value: extractedValue || 0,
            updated_at: new Date().toISOString(),
          };

          // Only update attribution if not already set and we found a match
          if (!existingLead.ad_id && adId) {
            updateData.ad_id = adId;
          }
          if (!existingLead.campaign_id && campaignId) {
            updateData.campaign_id = campaignId;
            updateData.adset_id = adsetId;
            updateData.ad_account_id = matchedAdAccountId;
          }

          const { error: updateError } = await supabase
            .from("ads_whatsapp_leads")
            .update(updateData)
            .eq("id", existingLead.id);

          if (updateError) {
            console.error("[TAG-WHATS] Error updating lead with purchase:", updateError);
          } else {
            console.log(`[TAG-WHATS] ✅ Updated lead ${existingLead.id} - purchase: ${extractedValue}, ad_id: ${adId || existingLead.ad_id || 'none'}`);
          }
        } else {
          // Create new lead with purchase info and attribution
          const { data: selectedAccount } = await supabase
            .from("ads_ad_accounts")
            .select("id")
            .eq("user_id", instance.user_id)
            .eq("is_selected", true)
            .maybeSingle();

          const { error: insertError } = await supabase
            .from("ads_whatsapp_leads")
            .insert({
              user_id: instance.user_id,
              phone: phone,
              first_contact_at: new Date().toISOString(),
              purchase_sent_at: new Date().toISOString(),
              purchase_value: extractedValue || 0,
              ad_id: adId,
              adset_id: adsetId,
              campaign_id: campaignId,
              ad_account_id: matchedAdAccountId || selectedAccount?.id || null,
              instance_id: instance.id,
              ctwa_clid: contactCtwaClid || null,
              ad_source_url: adSourceUrl || null,
            });

          if (insertError) {
            console.error("[TAG-WHATS] Error creating new lead:", insertError);
          } else {
            console.log(`[TAG-WHATS] ✅ Created lead: phone=${phone}, value=${extractedValue}, ad_id=${adId || 'none'}, campaign_id=${campaignId || 'none'}`);
          }
        }
      } catch (syncError) {
        console.error("[TAG-WHATS] Error syncing to ads_whatsapp_leads:", syncError);
      }
      
      console.log("[TAG-WHATS] ====== ADS_WHATSAPP_LEADS SYNC COMPLETE ======");
    }

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
          .select("id, push_subscription_ids, notify_on_sale, push_webhook_enabled, hide_sale_value_in_notification")
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
            
            // Fetch the contact's ad_source_url for click redirection
            let pushClickUrl: string | null = null;
            const { data: pushContact } = await supabase
              .from("inbox_contacts")
              .select("ad_source_url")
              .eq("phone", phone)
              .eq("user_id", instance.user_id)
              .eq("instance_id", instance.id)
              .limit(1)
              .maybeSingle();
            
            if (pushContact?.ad_source_url) {
              pushClickUrl = pushContact.ad_source_url;
              console.log(`[TAG-WHATS] Push notification will redirect to: ${pushClickUrl}`);
            }
            
            // Fetch user's custom notification templates
            const { data: templates, error: templatesError } = await supabase
              .from("sale_notification_templates")
              .select("title_template, body_template")
              .eq("user_id", ownerProfile.id)
              .eq("is_active", true)
              .order("sort_order", { ascending: true });
            
            if (templatesError) {
              console.error("[TAG-WHATS] Error fetching notification templates:", templatesError);
            }
            
            // Build notification title and message using the same defaults as the UI
            let notificationTitle = "💰 Pix Recebido!";
            let notificationMessage = extractedValue 
              ? `Pix pago no valor de R$ ${extractedValue.toFixed(2)}!` 
              : "Pix pago no valor de R$ 0.00!";
            
            // Use custom templates if available - alternates randomly
            if (templates && templates.length > 0) {
              // Pick a random template from active ones
              const randomIndex = Math.floor(Math.random() * templates.length);
              const selectedTemplate = templates[randomIndex];
              
              console.log(`[TAG-WHATS] Using custom template ${randomIndex + 1}/${templates.length}:`, {
                title: selectedTemplate.title_template,
                body: selectedTemplate.body_template?.substring(0, 50)
              });
              
              notificationTitle = selectedTemplate.title_template || notificationTitle;
              
              // Replace {valor} placeholder with actual value
              let body = selectedTemplate.body_template || notificationMessage;
              
              // Check if user wants to hide sale value
              if (ownerProfile.hide_sale_value_in_notification) {
                body = body.replace(/\{valor\}/gi, "***");
              } else {
                const formattedValue = extractedValue ? extractedValue.toFixed(2) : "0.00";
                body = body.replace(/\{valor\}/gi, formattedValue);
              }
              
              notificationMessage = body;
            } else {
              console.log("[TAG-WHATS] No custom templates found, using default notification");
              
              // Apply hide value setting to default message too
              if (ownerProfile.hide_sale_value_in_notification) {
                notificationMessage = "Pix Pago! Nova venda realizada! 🔥";
              }
            }
            
            const { error: insertError } = await supabase
              .from("push_notification_queue")
              .insert({
                user_id: ownerProfile.id,
                subscription_ids: ownerProfile.push_subscription_ids,
                title: notificationTitle,
                message: notificationMessage,
                icon_url: "https://zapdata.com.br/favicon.png",
                click_url: pushClickUrl,
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

    // ====== TRIGGER SALE FLOWS ======
    // When a PIX payment is detected, trigger all active sale flows for this contact
    if (isPixPayment && labelApplied) {
      console.log("[TAG-WHATS] ====== TRIGGERING SALE FLOWS ======");
      
      try {
        // Find the inbox_contact for this phone number on this instance
        const { data: saleContact, error: saleContactError } = await supabase
          .from("inbox_contacts")
          .select("id, instance_id")
          .eq("phone", phone)
          .eq("user_id", instance.user_id)
          .eq("instance_id", instance.id)
          .limit(1)
          .maybeSingle();

        if (saleContactError) {
          console.error("[TAG-WHATS] Error finding contact for sale flow:", saleContactError);
        } else if (saleContact) {
          console.log(`[TAG-WHATS] Found contact ${saleContact.id} for sale flow trigger`);
          
          // Find all active sale flows for this user that match the instance
          const { data: saleFlows, error: saleFlowsError } = await supabase
            .from("inbox_flows")
            .select("id, name, assigned_instances, pause_other_flows, nodes")
            .eq("user_id", instance.user_id)
            .eq("is_active", true)
            .eq("trigger_type", "sale");

          if (saleFlowsError) {
            console.error("[TAG-WHATS] Error fetching sale flows:", saleFlowsError);
          } else if (saleFlows && saleFlows.length > 0) {
            console.log(`[TAG-WHATS] Found ${saleFlows.length} active sale flow(s)`);
            
            for (const flow of saleFlows) {
              // Check if flow is assigned to this specific instance
              const assignedInstances = Array.isArray(flow.assigned_instances) ? flow.assigned_instances : [];
              
              if (assignedInstances.length > 0 && !assignedInstances.includes(instance.id)) {
                console.log(`[TAG-WHATS] Flow "${flow.name}" not assigned to instance ${instance.id}, skipping`);
                continue;
              }
              
              console.log(`[TAG-WHATS] Triggering sale flow "${flow.name}" (${flow.id}) for contact ${saleContact.id}`);
              
              try {
                const nowIso = new Date().toISOString();
                
                // Find start node
                const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
                const startNode = nodes.find((n: any) => (n?.type ?? "").toLowerCase() === "start");
                const startNodeId = startNode?.id ?? "start-1";
                
                // If pause_other_flows is enabled, pause all active sessions for this contact
                if (flow.pause_other_flows) {
                  const { data: activeSessions } = await supabase
                    .from("inbox_flow_sessions")
                    .select("id, flow_id, variables")
                    .eq("contact_id", saleContact.id)
                    .eq("user_id", instance.user_id)
                    .eq("status", "active")
                    .neq("flow_id", flow.id);

                  if (activeSessions && activeSessions.length > 0) {
                    console.log(`[TAG-WHATS] Pausing ${activeSessions.length} active session(s) for sale flow`);
                    
                    for (const sess of activeSessions) {
                      // Cancel any pending delay jobs
                      await supabase
                        .from("inbox_flow_delay_jobs")
                        .update({ status: "cancelled", updated_at: nowIso })
                        .eq("session_id", sess.id)
                        .eq("status", "scheduled");
                      
                      // Pause the session
                      await supabase
                        .from("inbox_flow_sessions")
                        .update({ status: "paused", last_interaction: nowIso })
                        .eq("id", sess.id);
                    }
                  }
                }
                
                // Create/upsert the flow session
                const baseVariables = {
                  lastMessage: "",
                  contactName: phone,
                  _sent_node_ids: [],
                  _triggered_by: "sale_tag_whats",
                  _pix_value: extractedValue,
                };
                
                const { data: sessionRow, error: sessionError } = await supabase
                  .from("inbox_flow_sessions")
                  .upsert(
                    {
                      flow_id: flow.id,
                      contact_id: saleContact.id,
                      instance_id: saleContact.instance_id,
                      user_id: instance.user_id,
                      current_node_id: startNodeId,
                      variables: baseVariables,
                      status: "active",
                      started_at: nowIso,
                      last_interaction: nowIso,
                      processing: false,
                      processing_started_at: null,
                    },
                    { onConflict: "flow_id,contact_id" }
                  )
                  .select("id")
                  .maybeSingle();

                if (sessionError) {
                  console.error(`[TAG-WHATS] Error creating session for flow ${flow.id}:`, sessionError);
                  continue;
                }

                const sessionId = sessionRow?.id;
                if (!sessionId) {
                  console.error(`[TAG-WHATS] Failed to create session for flow ${flow.id}`);
                  continue;
                }

                console.log(`[TAG-WHATS] Created sale flow session ${sessionId}, invoking process-inbox-flow...`);

                // Invoke process-inbox-flow to start the flow
                const { error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
                  body: { sessionId },
                });

                if (invokeError) {
                  console.error(`[TAG-WHATS] Error invoking process-inbox-flow for sale:`, invokeError);
                } else {
                  console.log(`[TAG-WHATS] ✅ Sale flow "${flow.name}" triggered successfully!`);
                }
              } catch (flowErr) {
                console.error(`[TAG-WHATS] Error triggering sale flow ${flow.id}:`, flowErr);
              }
            }
          } else {
            console.log("[TAG-WHATS] No active sale flows found for user");
          }
        } else {
          console.log("[TAG-WHATS] No inbox_contact found for phone on this instance, cannot trigger sale flow");
        }
      } catch (saleFlowError) {
        console.error("[TAG-WHATS] Error in sale flow triggering:", saleFlowError);
        // Don't fail the main process for sale flow errors
      }
      
      console.log("[TAG-WHATS] ====== SALE FLOWS COMPLETE ======");
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
