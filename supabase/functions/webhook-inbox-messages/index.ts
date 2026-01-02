import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to log ingest events for debugging
const logIngestEvent = async (
  supabaseClient: any,
  data: {
    instanceId?: string;
    userId?: string;
    reason: string;
    phonePrefix?: string;
    remoteJid?: string;
    phoneSource?: string;
    ctwaSource?: string;
    payloadHash?: string;
    payloadSnippet?: any;
    eventType?: 'skip' | 'error';
  }
) => {
  try {
    await supabaseClient.from('ads_lead_ingest_logs').insert({
      instance_id: data.instanceId || null,
      user_id: data.userId || null,
      reason: data.reason,
      phone_prefix: data.phonePrefix || null,
      remote_jid: data.remoteJid || null,
      phone_source: data.phoneSource || null,
      ctwa_source: data.ctwaSource || null,
      payload_hash: data.payloadHash || null,
      payload_snippet: data.payloadSnippet || null,
      event_type: data.eventType || 'skip',
    });
    console.log(`[INGEST-LOG] Recorded: ${data.reason}`);
  } catch (err) {
    console.error('[INGEST-LOG] Failed to record:', err);
  }
};

// Helper function to log webhook diagnostics
const logWebhookDiagnostic = async (
  supabaseClient: any,
  data: {
    instanceId?: string;
    instanceName: string;
    eventType: string;
    userId?: string;
    payloadPreview?: string;
  }
) => {
  try {
    await supabaseClient.from('webhook_diagnostics').insert({
      instance_id: data.instanceId || null,
      instance_name: data.instanceName,
      event_type: data.eventType,
      user_id: data.userId || null,
      payload_preview: data.payloadPreview || null,
    });
    console.log(`[WEBHOOK-DIAG] Recorded: ${data.instanceName} - ${data.eventType}`);
  } catch (err) {
    console.error('[WEBHOOK-DIAG] Failed to record:', err);
  }
};

// Helper function to save failed/discarded webhook messages for debugging
const saveFailedMessage = async (
  supabaseClient: any,
  data: {
    instanceName: string;
    eventType: string;
    discardReason: string;
    payload: any;
    phoneExtracted?: string;
    remoteJid?: string;
    userId?: string;
  }
) => {
  try {
    await supabaseClient.from('webhook_failed_messages').insert({
      instance_name: data.instanceName,
      event_type: data.eventType,
      discard_reason: data.discardReason,
      payload: data.payload,
      phone_extracted: data.phoneExtracted || null,
      remote_jid: data.remoteJid || null,
      user_id: data.userId || null,
    });
    console.log(`[FAILED-MSG] Saved failed message: ${data.discardReason}`);
  } catch (err) {
    console.error('[FAILED-MSG] Failed to save:', err);
  }
};

// Normalize message IDs from different providers (e.g., "owner:MESSAGE_ID" -> "MESSAGE_ID")
// This ensures consistent deduplication regardless of format variations
const normalizeRemoteMessageId = (id: string | null | undefined): string | null => {
  if (!id) return null;
  const trimmed = String(id).trim();
  if (!trimmed) return null;

  // UazAPI often prefixes outbound ids with "owner:" (e.g., "553173316464:3EB0...").
  // Status updates usually come without the prefix.
  // We extract just the message ID part for consistent matching.
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').filter(Boolean);
    const last = parts[parts.length - 1];
    // Message IDs are typically long alphanumeric strings
    if (last && last.length >= 8) return last;
  }

  return trimmed;
};

const INBOX_MEDIA_BUCKET = 'video-clips';

const isStoredMediaUrl = (url: string) => {
  return url.includes('/storage/v1/object/public/');
};

const guessExtension = (contentType: string | null, fallback: string) => {
  const ct = (contentType || '').toLowerCase();

  if (ct.includes('image/')) {
    const ext = ct.split('image/')[1]?.split(';')[0] || 'jpg';
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  if (ct.includes('audio/')) {
    return ct.split('audio/')[1]?.split(';')[0] || fallback;
  }
  if (ct.includes('video/')) {
    return ct.split('video/')[1]?.split(';')[0] || fallback;
  }
  if (ct.includes('application/pdf')) return 'pdf';
  return fallback;
};

// Unwrap nested message containers (common in ads/CTWA messages)
// Evolution API can wrap messages in ephemeralMessage, viewOnceMessage, etc.
const unwrapMessageContainer = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  
  const msg = data.message || data;
  
  // If message has key + message structure (double wrapped), get inner message
  if (msg && msg.key && msg.message) {
    return unwrapMessageContainer({ message: msg.message });
  }
  
  // Common wrapper types in ad/CTWA messages
  const wrapperTypes = [
    'ephemeralMessage',
    'viewOnceMessage', 
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'protocolMessage',
  ];
  
  for (const wrapperType of wrapperTypes) {
    if (msg && msg[wrapperType]?.message) {
      console.log(`[UNWRAP] Found ${wrapperType} wrapper, unwrapping...`);
      return unwrapMessageContainer({ message: msg[wrapperType].message });
    }
  }
  
  return msg;
};

// Extract content from various message formats
const extractMessageContent = (msgContent: any): { content: string; messageType: string; mediaUrl: string | null } => {
  if (!msgContent || typeof msgContent !== 'object') {
    console.log('[PARSER] Empty or invalid msgContent');
    return { content: '', messageType: 'text', mediaUrl: null };
  }
  
  // Log all keys for debugging
  const allKeys = Object.keys(msgContent);
  console.log(`[PARSER] Processing message with keys: ${allKeys.join(', ')}`);
  
  // Standard text messages
  if (msgContent.conversation) {
    return { content: msgContent.conversation, messageType: 'text', mediaUrl: null };
  }
  
  if (msgContent.extendedTextMessage?.text) {
    return { content: msgContent.extendedTextMessage.text, messageType: 'text', mediaUrl: null };
  }
  
  // Interactive messages (common in WhatsApp Business API / ads)
  if (msgContent.interactiveMessage) {
    const interactive = msgContent.interactiveMessage;
    console.log('[PARSER] Found interactiveMessage:', JSON.stringify(interactive).substring(0, 200));
    
    // Body text is the main content
    if (interactive.body?.text) {
      return { content: interactive.body.text, messageType: 'text', mediaUrl: null };
    }
    
    // Header can have text too
    if (interactive.header?.title) {
      return { content: interactive.header.title, messageType: 'text', mediaUrl: null };
    }
    
    // Native flow response
    if (interactive.nativeFlowResponseMessage?.paramsJson) {
      try {
        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
        const responseText = params.flow_token || params.response || JSON.stringify(params);
        return { content: `[Resposta de fluxo]: ${responseText}`, messageType: 'text', mediaUrl: null };
      } catch {
        return { content: '[Resposta de fluxo nativo]', messageType: 'text', mediaUrl: null };
      }
    }
    
    return { content: '[Mensagem interativa]', messageType: 'text', mediaUrl: null };
  }
  
  // Interactive button/list responses (user clicked a button/list item)
  if (msgContent.interactiveResponseMessage) {
    const response = msgContent.interactiveResponseMessage;
    console.log('[PARSER] Found interactiveResponseMessage:', JSON.stringify(response).substring(0, 200));
    
    // Button response
    if (response.nativeFlowResponseMessage?.paramsJson) {
      try {
        const params = JSON.parse(response.nativeFlowResponseMessage.paramsJson);
        return { content: params.id || params.flow_token || '[Resposta de botão]', messageType: 'text', mediaUrl: null };
      } catch {
        return { content: '[Resposta de botão]', messageType: 'text', mediaUrl: null };
      }
    }
    
    return { content: response.body?.text || '[Resposta interativa]', messageType: 'text', mediaUrl: null };
  }
  
  // Template messages (business templates)
  if (msgContent.templateMessage) {
    const tpl = msgContent.templateMessage;
    console.log('[PARSER] Found templateMessage:', JSON.stringify(tpl).substring(0, 200));
    
    // Hydratable 4-column template
    if (tpl.hydratedFourRowTemplate) {
      const h = tpl.hydratedFourRowTemplate;
      const content = h.hydratedContentText || h.hydratedTitleText || '';
      return { content: content || '[Template de negócio]', messageType: 'text', mediaUrl: null };
    }
    
    // Standard template with body
    if (tpl.hydratedTemplate?.hydratedContentText) {
      return { content: tpl.hydratedTemplate.hydratedContentText, messageType: 'text', mediaUrl: null };
    }
    
    return { content: '[Template de mensagem]', messageType: 'text', mediaUrl: null };
  }
  
  // Native flow messages (WhatsApp Flows)
  if (msgContent.nativeFlowMessage) {
    const flow = msgContent.nativeFlowMessage;
    console.log('[PARSER] Found nativeFlowMessage:', JSON.stringify(flow).substring(0, 200));
    return { content: flow.messageText || '[Fluxo nativo do WhatsApp]', messageType: 'text', mediaUrl: null };
  }
  
  // Product messages (catalog)
  if (msgContent.productMessage) {
    const prod = msgContent.productMessage;
    console.log('[PARSER] Found productMessage');
    const productName = prod.product?.productId || prod.product?.title || 'Produto';
    return { content: `🛒 Produto: ${productName}`, messageType: 'text', mediaUrl: null };
  }
  
  // Order messages
  if (msgContent.orderMessage) {
    const order = msgContent.orderMessage;
    console.log('[PARSER] Found orderMessage');
    return { content: `📦 Pedido: ${order.orderId || order.status || 'Novo pedido'}`, messageType: 'text', mediaUrl: null };
  }
  
  // Button response messages (legacy)
  if (msgContent.buttonsResponseMessage) {
    const btn = msgContent.buttonsResponseMessage;
    return { 
      content: btn.selectedDisplayText || btn.selectedButtonId || '[Resposta de botão]', 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  if (msgContent.listResponseMessage) {
    const list = msgContent.listResponseMessage;
    return { 
      content: list.title || list.singleSelectReply?.selectedRowId || '[Resposta de lista]', 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  if (msgContent.templateButtonReplyMessage) {
    const tpl = msgContent.templateButtonReplyMessage;
    return { 
      content: tpl.selectedDisplayText || tpl.selectedId || '[Resposta de template]', 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  // Request phone number message (business API)
  if (msgContent.requestPhoneNumberMessage) {
    return { content: '[Solicitação de número de telefone]', messageType: 'text', mediaUrl: null };
  }
  
  // High structured message (complex business message)
  if (msgContent.highlyStructuredMessage) {
    const hsm = msgContent.highlyStructuredMessage;
    console.log('[PARSER] Found highlyStructuredMessage');
    return { content: hsm.fallbackLg || '[Mensagem estruturada]', messageType: 'text', mediaUrl: null };
  }
  
  // Media messages
  if (msgContent.imageMessage) {
    return { 
      content: msgContent.imageMessage.caption || '', 
      messageType: 'image', 
      mediaUrl: msgContent.imageMessage.url || null 
    };
  }
  
  if (msgContent.audioMessage) {
    return { 
      content: '', 
      messageType: 'audio', 
      mediaUrl: msgContent.audioMessage.url || null 
    };
  }
  
  if (msgContent.videoMessage) {
    return { 
      content: msgContent.videoMessage.caption || '', 
      messageType: 'video', 
      mediaUrl: msgContent.videoMessage.url || null 
    };
  }
  
  if (msgContent.documentMessage) {
    return { 
      content: msgContent.documentMessage.fileName || '', 
      messageType: 'document', 
      mediaUrl: msgContent.documentMessage.url || null 
    };
  }
  
  if (msgContent.stickerMessage) {
    return { 
      content: '', 
      messageType: 'sticker', 
      mediaUrl: msgContent.stickerMessage.url || null 
    };
  }
  
  // Location messages
  if (msgContent.locationMessage) {
    const loc = msgContent.locationMessage;
    return { 
      content: `📍 ${loc.name || 'Localização'}: ${loc.degreesLatitude}, ${loc.degreesLongitude}`, 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  // Live location
  if (msgContent.liveLocationMessage) {
    const loc = msgContent.liveLocationMessage;
    return { 
      content: `📍 Localização ao vivo: ${loc.degreesLatitude}, ${loc.degreesLongitude}`, 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  // Contact messages  
  if (msgContent.contactMessage) {
    return { 
      content: `👤 Contato: ${msgContent.contactMessage.displayName || 'Desconhecido'}`, 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  // Contacts array message
  if (msgContent.contactsArrayMessage) {
    const contacts = msgContent.contactsArrayMessage.contacts || [];
    const names = contacts.map((c: any) => c.displayName).filter(Boolean).join(', ');
    return { 
      content: `👥 Contatos: ${names || 'Múltiplos contatos'}`, 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  // Reactions
  if (msgContent.reactionMessage) {
    return { 
      content: msgContent.reactionMessage.text || '👍', 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  // Poll messages
  if (msgContent.pollCreationMessage || msgContent.pollCreationMessageV3) {
    const poll = msgContent.pollCreationMessage || msgContent.pollCreationMessageV3;
    return { 
      content: `📊 Enquete: ${poll.name || 'Nova enquete'}`, 
      messageType: 'text', 
      mediaUrl: null 
    };
  }
  
  // Poll vote
  if (msgContent.pollUpdateMessage) {
    return { content: '[Voto em enquete]', messageType: 'text', mediaUrl: null };
  }
  
  // Pin message
  if (msgContent.pinInChatMessage) {
    return { content: '[Mensagem fixada]', messageType: 'text', mediaUrl: null };
  }
  
  // Event message (community events)
  if (msgContent.eventMessage) {
    const event = msgContent.eventMessage;
    return { content: `📅 Evento: ${event.name || 'Novo evento'}`, messageType: 'text', mediaUrl: null };
  }
  
  // Log unknown message type for debugging with full details
  const knownKeys = Object.keys(msgContent).filter(k => !['messageContextInfo', 'messageSecret'].includes(k));
  if (knownKeys.length > 0) {
    console.log(`[PARSER] Unknown message type, keys: ${knownKeys.join(', ')}`);
    console.log(`[PARSER] First unknown key content: ${JSON.stringify(msgContent[knownKeys[0]]).substring(0, 300)}`);
  }
  
  // Return placeholder with detected type (so messages still appear in chat)
  const detectedType = knownKeys.find(k => k.endsWith('Message')) || knownKeys[0] || 'desconhecido';
  return { content: `[Mensagem recebida - tipo: ${detectedType}]`, messageType: 'text', mediaUrl: null };
};

// Download media via Evolution API getBase64FromMediaMessage endpoint
// This is more reliable than direct download as it works even after the message is sent
const downloadMediaViaEvolutionAPI = async (
  instanceName: string,
  remoteJid: string,
  messageId: string
): Promise<{ base64: string; mimetype: string } | null> => {
  try {
    let baseUrl = Deno.env.get('EVOLUTION_BASE_URL') || '';
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');
    
    // Ensure baseUrl has protocol
    baseUrl = baseUrl.replace(/\/$/, '');
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }
    
    if (!baseUrl || !apiKey) {
      console.log('[MEDIA-EVOLUTION] No Evolution API config available');
      return null;
    }
    
    console.log(`[MEDIA-EVOLUTION] Fetching media via Evolution API: instance=${instanceName}, messageId=${messageId}`);
    
    const response = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          key: {
            remoteJid: remoteJid,
            id: messageId,
          }
        },
        convertToMp4: false,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[MEDIA-EVOLUTION] API error: status=${response.status}, body=${errorText.substring(0, 200)}`);
      return null;
    }
    
    const result = await response.json();
    
    if (result.base64 && result.mimetype) {
      console.log(`[MEDIA-EVOLUTION] Success! mimetype=${result.mimetype}, size=${result.base64.length} chars`);
      return { base64: result.base64, mimetype: result.mimetype };
    }
    
    console.log(`[MEDIA-EVOLUTION] No base64 in response:`, JSON.stringify(result).substring(0, 200));
    return null;
  } catch (err) {
    console.error('[MEDIA-EVOLUTION] Error:', err);
    return null;
  }
};

const persistMediaToStorage = async (
  supabaseClient: any,
  params: {
    url: string;
    userId: string;
    instanceId: string;
    messageType: string;
    messageId?: string | null;
    fileName?: string | null;
    instanceName?: string | null;
    remoteJid?: string | null;
  }
): Promise<string | null> => {
  const logPrefix = `[MEDIA-PERSIST] [${params.messageType}] [${params.messageId || 'no-id'}]`;
  
  try {
    // Skip if already stored or no URL
    if (!params.url) {
      console.log(`${logPrefix} No URL provided, skipping`);
      return null;
    }
    
    if (isStoredMediaUrl(params.url)) {
      console.log(`${logPrefix} Already persisted: ${params.url.substring(0, 60)}...`);
      return null;
    }
    
    console.log(`${logPrefix} Starting download from: ${params.url.substring(0, 100)}...`);

    const fallbackExtFromName = params.fileName?.includes('.')
      ? params.fileName.split('.').pop()?.toLowerCase()
      : undefined;

    const fallbackExtFromType = (() => {
      switch (params.messageType) {
        case 'image': return 'jpg';
        case 'audio': return 'ogg';
        case 'video': return 'mp4';
        case 'sticker': return 'webp';
        case 'document': return 'bin';
        default: return 'bin';
      }
    })();

    const fallbackExt = fallbackExtFromName || fallbackExtFromType;
    let arrayBuffer: ArrayBuffer | null = null;
    let contentType: string | null = null;

    // === METHOD 1: Direct download (fastest if URL is still valid) ===
    try {
      console.log(`${logPrefix} Attempting direct download...`);
      const res = await fetch(params.url, { 
        signal: AbortSignal.timeout(15000) // 15s timeout
      });
      
      if (res.ok) {
        contentType = res.headers.get('content-type');
        arrayBuffer = await res.arrayBuffer();
        console.log(`${logPrefix} Direct download SUCCESS: size=${arrayBuffer.byteLength}, contentType=${contentType}`);
      } else {
        console.log(`${logPrefix} Direct download FAILED: status=${res.status} ${res.statusText}`);
      }
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.log(`${logPrefix} Direct download ERROR: ${errMsg}`);
    }

    // === METHOD 2: Evolution API getBase64 (fallback for expired URLs) ===
    if (!arrayBuffer && params.instanceName && params.remoteJid && params.messageId) {
      console.log(`${logPrefix} Trying Evolution API getBase64...`);
      const evolutionResult = await downloadMediaViaEvolutionAPI(
        params.instanceName,
        params.remoteJid,
        params.messageId
      );
      
      if (evolutionResult) {
        // Decode base64 to ArrayBuffer
        const binaryString = atob(evolutionResult.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
        contentType = evolutionResult.mimetype;
        console.log(`${logPrefix} Evolution API SUCCESS: size=${arrayBuffer.byteLength}, mimetype=${contentType}`);
      } else {
        console.log(`${logPrefix} Evolution API FAILED`);
      }
    }

    // === No data obtained ===
    if (!arrayBuffer) {
      console.log(`${logPrefix} FAILED: Could not download media from any source`);
      return null;
    }
    
    // Force correct content-type for audio if generic
    if (params.messageType === 'audio' && (!contentType || contentType === 'application/octet-stream')) {
      contentType = 'audio/ogg';
      console.log(`${logPrefix} Forcing audio/ogg content-type`);
    }
    
    const blob = new Blob([arrayBuffer], { type: contentType || 'application/octet-stream' });
    const ext = guessExtension(contentType, fallbackExt);
    const id = params.messageId || crypto.randomUUID();
    const objectPath = `inbox-media/${params.userId}/${params.instanceId}/${params.messageType}/${id}.${ext}`;

    console.log(`${logPrefix} Uploading to storage: ${objectPath}`);

    const { error: uploadError } = await supabaseClient
      .storage
      .from(INBOX_MEDIA_BUCKET)
      .upload(objectPath, blob, {
        contentType: contentType || undefined,
        upsert: true,
        cacheControl: '31536000', // 1 year cache
      });

    if (uploadError) {
      console.error(`${logPrefix} Upload FAILED:`, uploadError);
      return null;
    }

    const { data } = await supabaseClient.storage.from(INBOX_MEDIA_BUCKET).getPublicUrl(objectPath);
    const publicUrl = data?.publicUrl || null;

    if (publicUrl) {
      console.log(`${logPrefix} SUCCESS: ${publicUrl}`);
    }

    return publicUrl;
  } catch (err) {
    console.error(`${logPrefix} UNEXPECTED ERROR:`, err);
    return null;
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log request metadata for debugging
    const requestUrl = req.url;
    const requestMethod = req.method;
    const forwardedFor = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    
    console.log('=== WEBHOOK REQUEST RECEIVED ===');
    console.log(`URL: ${requestUrl}`);
    console.log(`Method: ${requestMethod}`);
    console.log(`IP: ${forwardedFor}`);
    console.log(`User-Agent: ${userAgent}`);
    
    // Extract event type from URL path when UazAPI uses addUrlEvents=true
    // URL format: /webhook-inbox-messages/{evento}/{tipodemensagem}
    // e.g., /webhook-inbox-messages/messages/text or /webhook-inbox-messages/connection
    const url = new URL(requestUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Path structure: [functions, v1, webhook-inbox-messages, evento?, tipodemensagem?]
    let urlEventType: string | null = null;
    let urlMessageType: string | null = null;
    
    // Find index of webhook-inbox-messages in path
    const webhookIndex = pathParts.findIndex(p => p === 'webhook-inbox-messages');
    if (webhookIndex !== -1 && pathParts.length > webhookIndex + 1) {
      urlEventType = pathParts[webhookIndex + 1] || null;
      if (pathParts.length > webhookIndex + 2) {
        urlMessageType = pathParts[webhookIndex + 2] || null;
      }
    }
    
    console.log(`[URL-PARSER] URL event type: ${urlEventType}, message type: ${urlMessageType}`);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const rawBody = await req.text();
    console.log('Raw request body:', rawBody);
    
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Failed to parse JSON payload:', parseError);
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Webhook payload parsed:', JSON.stringify(payload, null, 2));

    // Determine event type - prioritize URL path (UazAPI addUrlEvents), then payload
    // UazAPI can send event in URL path when addUrlEvents=true
    // Evolution API sends event in payload
    let event = urlEventType || payload.event || payload.type;
    const instance = payload.instance || payload.instanceName;
    const data = payload.data || payload;
    
    // If event came from URL, normalize it to match our expected formats
    if (urlEventType) {
      console.log(`[UAZAPI-URL] Event from URL path: ${urlEventType}, message type: ${urlMessageType}`);
    }

    // Log webhook diagnostic for every event received
    const instanceName = typeof instance === 'string' ? instance : instance?.instanceName || 'unknown';
    console.log(`[WEBHOOK] Event: ${event}, Instance: ${instanceName}`);
    
    // Fetch instance info for diagnostic logging
    const { data: instanceData } = await supabaseClient
      .from('maturador_instances')
      .select('id, user_id')
      .eq('instance_name', instanceName)
      .maybeSingle();

    // Log diagnostic event (async, don't await)
    logWebhookDiagnostic(supabaseClient, {
      instanceId: instanceData?.id,
      instanceName: instanceName,
      eventType: event || 'unknown',
      userId: instanceData?.user_id,
      payloadPreview: JSON.stringify({ event, hasData: !!data }).slice(0, 500)
    });

    // Handle messages.upsert event (new incoming message)
    // UazAPI uses event: "messages" with payload directly containing message fields (chatid, sender, text, etc.)
    // Evolution API uses event: "messages.upsert" with data.key structure
    if (event === 'messages.upsert' || event === 'message' || event === 'MESSAGES_UPSERT' || event === 'messages') {
      
      // DETECT UAZAPI FORMAT
      // UazAPI can send the message either:
      // 1) directly in the payload: { chatid, sender, text, ... }
      // 2) nested under payload.message: { message: { chatid, sender, text, ... }, chat: {...}, instanceName, ... }
      const uazCandidate =
        (payload && payload.chatid ? payload : null) ||
        (payload && payload.message && payload.message.chatid ? payload.message : null) ||
        (data && data.chatid ? data : null) ||
        (data && data.message && data.message.chatid ? data.message : null);

      // Check if this is a UazAPI format message (has chatid but no Evolution data.key structure)
      const isUazapiFormat = !!uazCandidate && !(data.key || data.message?.key);

      if (isUazapiFormat) {
        console.log('[UAZAPI-WEBHOOK] Detected UazAPI message format');

        const uazMsg = uazCandidate;
        // UazAPI message object: { chatid, sender, senderName, text, messageType, fromMe, messageid, messageTimestamp, ... }
        const uazChatid = uazMsg.chatid || '';
        const uazSender = uazMsg.sender || '';
        const uazSenderName = uazMsg.senderName || uazMsg.pushName || '';
        const uazText = uazMsg.text || '';
        const uazMessageType = uazMsg.messageType || 'conversation';
        const uazFromMe = uazMsg.fromMe === true || uazMsg.fromMe === 'true';
        const uazMessageId = uazMsg.messageid || uazMsg.id || '';
        const uazTimestamp = uazMsg.messageTimestamp || Date.now();
        const uazFileUrl = uazMsg.fileURL || '';
        const uazWasSentByApi = uazMsg.wasSentByApi === true;
        
        console.log(`[UAZAPI-WEBHOOK] chatid=${uazChatid}, sender=${uazSender}, fromMe=${uazFromMe}, text=${uazText.substring(0, 50)}, wasSentByApi=${uazWasSentByApi}`);
        
        // Skip messages sent by API to prevent loops
        if (uazWasSentByApi) {
          console.log('[UAZAPI-WEBHOOK] Skipping message sent by API (wasSentByApi=true)');
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'sent_by_api' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const uazMessageIdNormalized = normalizeRemoteMessageId(uazMessageId);
        
        // Skip outbound messages already in our system
        if (uazFromMe && uazMessageIdNormalized) {
          const { data: existingMessage } = await supabaseClient
            .from('inbox_messages')
            .select('id')
            .eq('remote_message_id', uazMessageIdNormalized)
            .maybeSingle();
          
          if (existingMessage) {
            console.log('[UAZAPI-WEBHOOK] Skipping outgoing message sent by platform:', uazMessageId);
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'sent_by_platform' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        
        // Skip group messages
        if (uazChatid.includes('@g.us') || uazMsg.isGroup === true) {
          console.log('[UAZAPI-WEBHOOK] Skipping group message');
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'group_message' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Extract phone from chatid (format: 5531999999999@s.whatsapp.net)
        const phone = uazChatid.split('@')[0].replace(/\D/g, '');
        if (phone.length < 10 || phone.length > 15) {
          console.log(`[UAZAPI-WEBHOOK] Invalid phone length: ${phone.length}`);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'invalid_phone' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log(`[UAZAPI-WEBHOOK] Processing message from phone: ${phone}`);
        
        // Find instance by instance_name
        const instanceNameForLookup = instanceName !== 'unknown' ? instanceName : (uazMsg.owner || '').split('@')[0];
        const { data: instanceInfo } = await supabaseClient
          .from('maturador_instances')
          .select('id, user_id')
          .eq('instance_name', instanceNameForLookup)
          .maybeSingle();
        
        if (!instanceInfo) {
          console.log(`[UAZAPI-WEBHOOK] Instance not found: ${instanceNameForLookup}`);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'instance_not_found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const instanceId = instanceInfo.id;
        const userId = instanceInfo.user_id;
        
        console.log(`[UAZAPI-WEBHOOK] Instance found: ${instanceId}, user: ${userId}`);
        
        // Find or create contact - IMPORTANT: contact is unique per phone + instance combination
        let contact;
        const { data: existingContact } = await supabaseClient
          .from('inbox_contacts')
          .select('*')
          .eq('phone', phone)
          .eq('user_id', userId)
          .eq('instance_id', instanceId)
          .maybeSingle();
        
        if (existingContact) {
          contact = existingContact;
          // Update name if we have a better one
          if (uazSenderName && !existingContact.name) {
            await supabaseClient
              .from('inbox_contacts')
              .update({ name: uazSenderName, updated_at: new Date().toISOString() })
              .eq('id', existingContact.id);
            contact.name = uazSenderName;
          }
        } else {
          // Create new contact - one per phone + instance combination
          const { data: newContact, error: contactError } = await supabaseClient
            .from('inbox_contacts')
            .insert({
              phone,
              name: uazSenderName || null,
              user_id: userId,
              instance_id: instanceId,
              remote_jid: uazChatid,
              status: 'active',
            })
            .select()
            .single();
          
          if (contactError) {
            console.error('[UAZAPI-WEBHOOK] Error creating contact:', contactError);
            return new Response(JSON.stringify({ success: false, error: 'Failed to create contact' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          contact = newContact;
          console.log(`[UAZAPI-WEBHOOK] Created new contact: ${contact.id} for instance ${instanceId}`);
        }
        
        // Map UazAPI message type to our types
        let messageType = 'text';
        let mediaUrl = uazFileUrl || null;
        const msgTypeLower = (uazMessageType || '').toLowerCase();
        if (msgTypeLower.includes('image')) messageType = 'image';
        else if (msgTypeLower.includes('audio') || msgTypeLower.includes('ptt')) messageType = 'audio';
        else if (msgTypeLower.includes('video')) messageType = 'video';
        else if (msgTypeLower.includes('document')) messageType = 'document';
        else if (msgTypeLower.includes('sticker')) messageType = 'sticker';
        
        // Check if message already exists (use normalized ID)
        if (uazMessageIdNormalized) {
          const { data: existingMsg } = await supabaseClient
            .from('inbox_messages')
            .select('id')
            .eq('remote_message_id', uazMessageIdNormalized)
            .maybeSingle();
          
          if (existingMsg) {
            console.log(`[UAZAPI-WEBHOOK] Message already exists: ${uazMessageIdNormalized}`);
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'duplicate' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        
        // For media messages, persist to storage immediately so media is available right away
        if (messageType !== 'text' && uazMessageIdNormalized) {
          console.log(`[UAZAPI-WEBHOOK] Media message detected (${messageType}), attempting to persist...`);
          
          // Get instance token for UazAPI download
          const { data: instanceData } = await supabaseClient
            .from('maturador_instances')
            .select('uazapi_token')
            .eq('id', instanceId)
            .single();
          
          const uazapiToken = instanceData?.uazapi_token;
          
          if (uazapiToken) {
            // Get global UazAPI config
            const { data: globalConfig } = await supabaseClient
              .from('whatsapp_api_config')
              .select('uazapi_base_url')
              .limit(1)
              .maybeSingle();
            
            const uazapiBaseUrl = globalConfig?.uazapi_base_url?.replace(/\/$/, '') || 'https://zapdata.uazapi.com';
            
            try {
              console.log(`[UAZAPI-WEBHOOK] Downloading media via UAZAPI: ${uazapiBaseUrl}/message/download, id=${uazMessageIdNormalized}`);
              
              const downloadResponse = await fetch(`${uazapiBaseUrl}/message/download`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'token': uazapiToken,
                },
                body: JSON.stringify({
                  id: uazMessageIdNormalized,
                  return_base64: true,
                  return_link: false,
                }),
              });
              
              if (downloadResponse.ok) {
                const downloadData = await downloadResponse.json();
                const mediaBase64 = downloadData.base64Data || downloadData.base64 || downloadData.data || '';
                const mediaMimetype = downloadData.mimetype || 'application/octet-stream';
                
                if (mediaBase64 && mediaBase64.length > 0) {
                  console.log(`[UAZAPI-WEBHOOK] Media downloaded: ${mediaBase64.length} chars, mimetype=${mediaMimetype}`);
                  
                  // Convert base64 to ArrayBuffer
                  const binaryString = atob(mediaBase64);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  
                  // Upload to storage
                  const ext = guessExtension(mediaMimetype, messageType === 'image' ? 'jpg' : messageType === 'audio' ? 'ogg' : 'bin');
                  const objectPath = `inbox-media/${userId}/${instanceId}/${messageType}/${uazMessageIdNormalized}.${ext}`;
                  
                  const { error: uploadError } = await supabaseClient
                    .storage
                    .from(INBOX_MEDIA_BUCKET)
                    .upload(objectPath, bytes, {
                      contentType: mediaMimetype,
                      upsert: true,
                      cacheControl: '31536000',
                    });
                  
                  if (!uploadError) {
                    const { data: urlData } = await supabaseClient.storage.from(INBOX_MEDIA_BUCKET).getPublicUrl(objectPath);
                    if (urlData?.publicUrl) {
                      mediaUrl = urlData.publicUrl;
                      console.log(`[UAZAPI-WEBHOOK] Media persisted to storage: ${mediaUrl}`);
                    }
                  } else {
                    console.error(`[UAZAPI-WEBHOOK] Upload failed:`, uploadError);
                  }
                } else {
                  console.log(`[UAZAPI-WEBHOOK] No base64 data in download response`);
                }
              } else {
                console.log(`[UAZAPI-WEBHOOK] Download failed: ${downloadResponse.status}`);
              }
            } catch (downloadErr) {
              console.error(`[UAZAPI-WEBHOOK] Media download error:`, downloadErr);
            }
          }
        }
        
        // Insert message (always use normalized ID)
        const direction = uazFromMe ? 'outbound' : 'inbound';
        const { data: insertedMessage, error: msgError } = await supabaseClient
          .from('inbox_messages')
          .insert({
            contact_id: contact.id,
            instance_id: instanceId,
            user_id: userId,
            direction,
            message_type: messageType,
            content: uazText || null,
            media_url: mediaUrl,
            status: 'received',
            remote_message_id: uazMessageIdNormalized || null,
            is_from_flow: false,
          })
          .select()
          .single();
        
        if (msgError) {
          console.error('[UAZAPI-WEBHOOK] Error inserting message:', msgError);
          return new Response(JSON.stringify({ success: false, error: 'Failed to insert message' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log(`[UAZAPI-WEBHOOK] Message inserted: ${insertedMessage.id}`);
        
        // Update contact last_message_at
        await supabaseClient
          .from('inbox_contacts')
          .update({ 
            last_message_at: new Date().toISOString(),
            unread_count: contact.unread_count + (direction === 'inbound' ? 1 : 0)
          })
          .eq('id', contact.id);
        
        // For inbound messages with image/document, trigger Tag Whats processing
        console.log(`[TAG-WHATS-TRIGGER] Checking: direction=${direction}, messageType=${messageType}, instanceId=${instanceId}`);
        
        if (direction === 'inbound' && (messageType === 'image' || messageType === 'document')) {
          console.log(`[TAG-WHATS-TRIGGER] Eligible message detected, checking config for instance ${instanceId}`);
          try {
            // Check if Tag Whats is configured for this instance
            const { data: tagWhatsConfig, error: tagWhatsConfigError } = await supabaseClient
              .from('tag_whats_configs')
              .select('id, is_active, filter_images, filter_pdfs')
              .eq('instance_id', instanceId)
              .eq('is_active', true)
              .maybeSingle();
            
            console.log(`[TAG-WHATS-TRIGGER] Config query result:`, { tagWhatsConfig, tagWhatsConfigError });
            
            if (tagWhatsConfig) {
              const shouldProcess = 
                (messageType === 'image' && tagWhatsConfig.filter_images) ||
                (messageType === 'document' && tagWhatsConfig.filter_pdfs);
              
              console.log(`[TAG-WHATS-TRIGGER] shouldProcess=${shouldProcess}, filter_images=${tagWhatsConfig.filter_images}, filter_pdfs=${tagWhatsConfig.filter_pdfs}`);
              
              if (shouldProcess) {
                console.log(`[TAG-WHATS-TRIGGER] Tag Whats active, triggering processing for ${messageType}`);
                
                const supabaseUrl = Deno.env.get('SUPABASE_URL');
                const tagWhatsPayload = {
                  event: 'messages',
                  instanceName: instanceNameForLookup,
                  data: {
                    key: {
                      remoteJid: uazChatid,
                      fromMe: uazFromMe,
                      id: uazMessageId,
                    },
                    message: messageType === 'image' 
                      ? { imageMessage: { caption: uazText } }
                      : { documentMessage: { fileName: uazText, mimetype: 'application/pdf' } },
                    messageType: uazMessageType,
                    pushName: uazSenderName,
                  },
                };
                
                console.log(`[TAG-WHATS-TRIGGER] Calling tag-whats-process with payload:`, JSON.stringify(tagWhatsPayload).substring(0, 500));
                
                // Make the call and await it for better error handling
                try {
                  const tagWhatsResponse = await fetch(`${supabaseUrl}/functions/v1/tag-whats-process`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(tagWhatsPayload),
                  });
                  
                  const tagWhatsResult = await tagWhatsResponse.text();
                  console.log(`[TAG-WHATS-TRIGGER] Response: status=${tagWhatsResponse.status}, body=${tagWhatsResult.substring(0, 300)}`);
                } catch (fetchErr) {
                  console.error('[TAG-WHATS-TRIGGER] Fetch error:', fetchErr);
                }
              }
            } else {
              console.log(`[TAG-WHATS-TRIGGER] No active config found for instance ${instanceId}`);
            }
          } catch (tagWhatsErr) {
            console.error('[TAG-WHATS-TRIGGER] Error checking Tag Whats config:', tagWhatsErr);
          }
        } else {
          console.log(`[TAG-WHATS-TRIGGER] Skipped: direction=${direction}, messageType=${messageType}`);
        }
        
        // For inbound messages, check if we need to trigger a flow
        if (direction === 'inbound' && !uazFromMe) {
          // Check if flow is paused for this contact
          if (contact.flow_paused === true) {
            console.log(`[UAZAPI-WEBHOOK] Flow is paused for contact ${contact.id}, skipping flow processing`);
          } else {
            // Check for active flow session waiting for input
            const { data: activeSession } = await supabaseClient
              .from('inbox_flow_sessions')
              .select('*, flow:inbox_flows(*)')
              .eq('contact_id', contact.id)
              .eq('status', 'active')
              .order('last_interaction', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (activeSession) {
              // Get the current node to check if it's waiting for input
              const flowNodes = (activeSession.flow?.nodes || []) as Array<{ id: string; type: string; data: Record<string, unknown> }>;
              const currentNode = flowNodes.find((n: { id: string }) => n.id === activeSession.current_node_id);

              // Keyword trigger override: always restart from the beginning when a keyword is detected
              const inboundText = (uazText || '').trim();
              if (inboundText) {
                const { data: flowsForKeyword } = await supabaseClient
                  .from('inbox_flows')
                  .select('*')
                  .eq('user_id', userId)
                  .eq('is_active', true)
                  .eq('trigger_type', 'keyword')
                  .order('priority', { ascending: false });

                const lowerContent = inboundText.toLowerCase();
                let keywordFlowToTrigger: any | null = null;

                for (const flow of flowsForKeyword || []) {
                  const assignedInstances = (flow.assigned_instances as string[]) || [];
                  if (assignedInstances.length > 0 && !assignedInstances.includes(instanceId)) continue;

                  const keywords = (flow.trigger_keywords as string[]) || [];
                  for (const kw of keywords) {
                    const kwStr = String(kw || '').trim();
                    if (kwStr && lowerContent.includes(kwStr.toLowerCase())) {
                      keywordFlowToTrigger = flow;
                      console.log(`[UAZAPI-WEBHOOK] Keyword match -> restarting flow "${flow.name}" by "${kwStr}"`);
                      break;
                    }
                  }
                  if (keywordFlowToTrigger) break;
                }

                if (keywordFlowToTrigger) {
                  // Cancel all active sessions for this contact and start fresh
                  const { data: sessionsToCancel } = await supabaseClient
                    .from('inbox_flow_sessions')
                    .select('id')
                    .eq('contact_id', contact.id)
                    .eq('status', 'active');

                  if (sessionsToCancel?.length) {
                    await supabaseClient
                      .from('inbox_flow_delay_jobs')
                      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                      .in('session_id', sessionsToCancel.map((s: any) => s.id))
                      .in('status', ['pending', 'scheduled']);

                    await supabaseClient
                      .from('inbox_flow_sessions')
                      .update({ status: 'completed', updated_at: new Date().toISOString() })
                      .in('id', sessionsToCancel.map((s: any) => s.id));

                    console.log(`[UAZAPI-WEBHOOK] Canceled ${sessionsToCancel.length} active session(s) for keyword restart`);
                  }

                  const { data: newSession, error: newSessionError } = await supabaseClient
                    .from('inbox_flow_sessions')
                    .insert({
                      flow_id: keywordFlowToTrigger.id,
                      contact_id: contact.id,
                      instance_id: instanceId,
                      user_id: userId,
                      current_node_id: 'start-1',
                      variables: {
                        nome: contact.name || '',
                        telefone: phone,
                        resposta: inboundText,
                        lastMessage: inboundText,
                        ultima_mensagem: inboundText,
                        contactName: contact.name || phone,
                      },
                      status: 'active',
                      processing: false,
                      processing_started_at: null,
                    })
                    .select()
                    .single();

                  if (newSession && !newSessionError) {
                    try {
                      const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
                      await fetch(processUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        },
                        body: JSON.stringify({ sessionId: newSession.id }),
                      });
                      console.log(`[UAZAPI-WEBHOOK] Keyword flow triggered for session ${newSession.id}`);
                    } catch (e) {
                      console.error('[UAZAPI-WEBHOOK] Error invoking keyword flow:', e);
                    }
                  } else if (newSessionError) {
                    console.error('[UAZAPI-WEBHOOK] Error creating keyword session:', newSessionError);
                  }

                  return new Response(
                    JSON.stringify({ success: true, messageId: insertedMessage.id, keywordTriggered: true }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
              }

              // Check if session is locked
              if (activeSession.processing) {
                const lockAge = activeSession.processing_started_at 
                  ? Date.now() - new Date(activeSession.processing_started_at).getTime() 
                  : 0;
                
                if (lockAge < 60000) {
                  console.log(`[UAZAPI-WEBHOOK] Session ${activeSession.id} is locked (${lockAge}ms), skipping`);
                } else {
                  console.log(`[UAZAPI-WEBHOOK] Session ${activeSession.id} has stale lock (${lockAge}ms), proceeding`);
                }
              }
              
              // Check if current node is waiting for input (waitInput, menu, or paymentIdentifier)
              const isWaitingForInput = currentNode && (
                currentNode.type === 'waitInput' || 
                currentNode.type === 'menu' || 
                currentNode.type === 'paymentIdentifier'
              );
              
              if (isWaitingForInput) {
                console.log(`[UAZAPI-WEBHOOK] Found active session ${activeSession.id} waiting for input at node ${currentNode.id} (type: ${currentNode.type})`);
                
                // For paymentIdentifier, we only care about media messages (images/PDFs)
                if (currentNode.type === 'paymentIdentifier') {
                  const isMediaMessage = ['image', 'document'].includes(messageType);
                  
                  if (isMediaMessage) {
                    console.log(`[UAZAPI-WEBHOOK] Media received for paymentIdentifier: ${messageType}`);
                    
                    // Process the media and continue the flow
                    try {
                      const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
                      const processResponse = await fetch(processUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        },
                        body: JSON.stringify({ sessionId: activeSession.id, userInput: uazText || '' }),
                      });
                      
                      if (!processResponse.ok) {
                        const errorText = await processResponse.text();
                        console.error('[UAZAPI-WEBHOOK] Error processing payment media:', errorText);
                      } else {
                        console.log('[UAZAPI-WEBHOOK] Payment media processed, flow continued');
                      }
                    } catch (flowError) {
                      console.error('[UAZAPI-WEBHOOK] Error calling process-inbox-flow for payment:', flowError);
                    }
                  } else {
                    console.log(`[UAZAPI-WEBHOOK] Non-media message (${messageType}) while waiting for payment - ignoring`);
                  }
                } else {
                  // For waitInput and menu nodes
                  // Check if message is media without text content - if so, IGNORE it
                  const isMediaMessage = ['image', 'audio', 'video', 'document', 'sticker'].includes(messageType);
                  const hasTextContent = uazText && uazText.trim().length > 0;
                  
                  if (isMediaMessage && !hasTextContent) {
                    console.log(`[UAZAPI-WEBHOOK] Ignoring media message (${messageType}) without caption - flow continues waiting for text input`);
                  } else {
                    console.log(`[UAZAPI-WEBHOOK] Valid input received: "${uazText?.substring(0, 50)}"`);
                    
                    // Cancel any pending timeout job for this session
                    await supabaseClient
                      .from('inbox_flow_delay_jobs')
                      .update({ 
                        status: 'done',
                        updated_at: new Date().toISOString()
                      })
                      .eq('session_id', activeSession.id)
                      .eq('status', 'scheduled');
                    
                    // Clear timeout_at from session
                    await supabaseClient
                      .from('inbox_flow_sessions')
                      .update({ timeout_at: null })
                      .eq('id', activeSession.id);
                    
                    // Process the user's input and continue the flow using HTTP call with service role
                    try {
                      const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
                      const processResponse = await fetch(processUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        },
                        body: JSON.stringify({ sessionId: activeSession.id, userInput: uazText }),
                      });
                      
                      if (!processResponse.ok) {
                        const errorText = await processResponse.text();
                        console.error('[UAZAPI-WEBHOOK] Error processing user input:', errorText);
                      } else {
                        console.log('[UAZAPI-WEBHOOK] User input processed, flow continued');
                      }
                    } catch (flowError) {
                      console.error('[UAZAPI-WEBHOOK] Error calling process-inbox-flow for input:', flowError);
                    }
                  }
                }
              } else {
                console.log(`[UAZAPI-WEBHOOK] Active session exists but not waiting for input (node: ${currentNode?.type || 'unknown'})`);
              }
            } else {
              // Check triggers (keyword has priority)
              console.log(`[UAZAPI-WEBHOOK] Checking for flow triggers`);

              const inboundText = (uazText || '').trim();
              const hasInboundText = inboundText.length > 0;

              const { data: flows, error: flowsError } = await supabaseClient
                .from('inbox_flows')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true)
                .order('priority', { ascending: false });

              if (flowsError) {
                console.error('[UAZAPI-WEBHOOK] Error fetching flows:', flowsError);
              }

              if (flows && flows.length > 0 && hasInboundText) {
                const lowerContent = inboundText.toLowerCase();

                // 1) Keyword flows: ALWAYS restart from beginning when keyword is detected
                let keywordFlowToTrigger: any | null = null;
                let matchedKeyword: string | null = null;

                for (const flow of flows) {
                  if (flow.trigger_type !== 'keyword') continue;

                  const assignedInstances = (flow.assigned_instances as string[]) || [];
                  if (assignedInstances.length > 0 && !assignedInstances.includes(instanceId)) continue;

                  const keywords = (flow.trigger_keywords as string[]) || [];
                  for (const kw of keywords) {
                    const kwStr = String(kw || '').trim();
                    if (kwStr && lowerContent.includes(kwStr.toLowerCase())) {
                      keywordFlowToTrigger = flow;
                      matchedKeyword = kwStr;
                      break;
                    }
                  }
                  if (keywordFlowToTrigger) break;
                }

                if (keywordFlowToTrigger) {
                  console.log(`[UAZAPI-WEBHOOK] Keyword trigger matched: flow="${keywordFlowToTrigger.name}", keyword="${matchedKeyword}"`);

                  // Cancel ANY active sessions for this contact (keyword triggers always restart)
                  const { data: sessionsToCancel } = await supabaseClient
                    .from('inbox_flow_sessions')
                    .select('id')
                    .eq('contact_id', contact.id)
                    .eq('status', 'active');

                  if (sessionsToCancel?.length) {
                    await supabaseClient
                      .from('inbox_flow_delay_jobs')
                      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                      .in('session_id', sessionsToCancel.map((s: any) => s.id))
                      .in('status', ['pending', 'scheduled']);

                    await supabaseClient
                      .from('inbox_flow_sessions')
                      .update({ status: 'completed', updated_at: new Date().toISOString() })
                      .in('id', sessionsToCancel.map((s: any) => s.id));

                    console.log(`[UAZAPI-WEBHOOK] Canceled ${sessionsToCancel.length} active session(s) for keyword restart`);
                  }

                  const { data: newSession, error: newSessionError } = await supabaseClient
                    .from('inbox_flow_sessions')
                    .insert({
                      flow_id: keywordFlowToTrigger.id,
                      contact_id: contact.id,
                      instance_id: instanceId,
                      user_id: userId,
                      current_node_id: 'start-1',
                      variables: {
                        nome: contact.name || '',
                        telefone: phone,
                        resposta: inboundText,
                        lastMessage: inboundText,
                        ultima_mensagem: inboundText,
                        contactName: contact.name || phone,
                      },
                      status: 'active',
                      processing: false,
                      processing_started_at: null,
                    })
                    .select()
                    .single();

                  if (newSession && !newSessionError) {
                    try {
                      const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
                      await fetch(processUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        },
                        body: JSON.stringify({ sessionId: newSession.id }),
                      });
                      console.log(`[UAZAPI-WEBHOOK] Keyword flow triggered for session ${newSession.id}`);
                    } catch (e) {
                      console.error('[UAZAPI-WEBHOOK] Error invoking keyword flow:', e);
                    }
                  } else if (newSessionError) {
                    console.error('[UAZAPI-WEBHOOK] Error creating keyword session:', newSessionError);
                  }

                  return new Response(
                    JSON.stringify({ success: true, messageId: insertedMessage.id, keywordTriggered: true }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }

                // 2) "All messages" flows: trigger only ONCE per contact (until contact is deleted)
                for (const flow of flows) {
                  if (flow.trigger_type !== 'all') continue;

                  const assignedInstances = (flow.assigned_instances as string[]) || [];
                  if (assignedInstances.length > 0 && !assignedInstances.includes(instanceId)) continue;

                  // Only trigger if this contact has NEVER started this flow before
                  const { data: existingSession } = await supabaseClient
                    .from('inbox_flow_sessions')
                    .select('id')
                    .eq('contact_id', contact.id)
                    .eq('flow_id', flow.id)
                    .limit(1)
                    .maybeSingle();

                  if (existingSession) {
                    console.log(`[UAZAPI-WEBHOOK] All-messages flow already triggered once (flow="${flow.name}") -> skipping`);
                    continue;
                  }

                  console.log(`[UAZAPI-WEBHOOK] Triggering all-messages flow "${flow.name}" (first time for this contact)`);

                  const { data: newSession, error: newSessionError } = await supabaseClient
                    .from('inbox_flow_sessions')
                    .insert({
                      flow_id: flow.id,
                      contact_id: contact.id,
                      instance_id: instanceId,
                      user_id: userId,
                      current_node_id: 'start-1',
                      variables: {
                        nome: contact.name || '',
                        telefone: phone,
                        resposta: inboundText,
                        lastMessage: inboundText,
                        ultima_mensagem: inboundText,
                        contactName: contact.name || phone,
                      },
                      status: 'active',
                      processing: false,
                      processing_started_at: null,
                    })
                    .select()
                    .single();

                  if (newSession && !newSessionError) {
                    try {
                      const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
                      await fetch(processUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        },
                        body: JSON.stringify({ sessionId: newSession.id }),
                      });
                      console.log(`[UAZAPI-WEBHOOK] All-messages flow triggered for session ${newSession.id}`);
                    } catch (e) {
                      console.error('[UAZAPI-WEBHOOK] Error invoking all-messages flow:', e);
                    }
                  } else if (newSessionError) {
                    console.error('[UAZAPI-WEBHOOK] Error creating all-messages session:', newSessionError);
                  }

                  break;
                }
              }
            }
          }
        }
        
        return new Response(JSON.stringify({ success: true, messageId: insertedMessage.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Evolution API v2 structure: data.key contains remoteJid/remoteJidAlt, data.message contains content
      // Fallback to old structure (data.message.key) for backwards compatibility
      const key = data.key || data.message?.key || {};
      const messageIdRaw = key.id;
      const messageId = normalizeRemoteMessageId(messageIdRaw);
      const fromMeRaw = (key as any).fromMe;
      const isFromMe =
        fromMeRaw === true ||
        fromMeRaw === 'true' ||
        fromMeRaw === 1 ||
        fromMeRaw === '1';
      
      // Check if this outgoing message was sent by our platform
      if (isFromMe && messageId) {
        const { data: existingMessage } = await supabaseClient
          .from('inbox_messages')
          .select('id')
          .eq('remote_message_id', messageId)
          .maybeSingle();
        
        if (existingMessage) {
          console.log('Skipping outgoing message sent by platform:', messageId);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'sent_by_platform' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log('Processing outgoing message from external source (WhatsApp Web/Mobile):', messageId);
      }

      const remoteJid = key.remoteJid || '';
      const remoteJidAlt = key.remoteJidAlt || '';
      
      // Get participant fields (used in ads/group-like messages) - need these BEFORE group check
      const participant = key.participant || '';
      const participantAlt = key.participantAlt || '';
      const addressingMode = key.addressingMode || '';
      
      console.log(`Message JIDs: remoteJid=${remoteJid}, remoteJidAlt=${remoteJidAlt}`);
      
      // Helper function to validate phone JID - defined early for use in group check
      const isValidPhoneJid = (jid: string): boolean => {
        if (!jid) return false;
        if (!jid.includes('@s.whatsapp.net')) return false;
        const phone = jid.split('@')[0].replace(/\D/g, '');
        // Must be 10-15 digits (international phone numbers)
        return phone.length >= 10 && phone.length <= 15;
      };
      
      // Skip group messages (@g.us) - BUT check if this is an AD MESSAGE first
      // Ad messages can have @g.us in remoteJid but have valid phone in participantAlt
      if (remoteJid.includes('@g.us') || remoteJidAlt?.includes('@g.us')) {
        // Check if participantAlt has a valid phone (this indicates an ad message, not a real group)
        const hasValidParticipantAlt = isValidPhoneJid(participantAlt);
        const isLidAddressingMode = addressingMode === 'lid';
        
        if (hasValidParticipantAlt || isLidAddressingMode) {
          console.log(`[AD-MESSAGE] Detected ad message with @g.us remoteJid but valid participantAlt`);
          console.log(`  participantAlt: ${participantAlt}`);
          console.log(`  addressingMode: ${addressingMode}`);
          // Continue processing - this is an AD message, not a real group
        } else {
          // This is a real group message with no valid participant
          console.log('Skipping group message (no valid participantAlt)');
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'group_message' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // Find valid phone from multiple sources
      // Priority: participantAlt > remoteJid > remoteJidAlt > participant > contextInfo
      // (participantAlt is prioritized as it often has the real phone for ad messages)
      // ONLY accept @s.whatsapp.net format - reject @lid (internal IDs)
      let jidForPhone = '';
      let phoneSource = '';
      
      // Get contextInfo fields (often contains real phone for ad messages)
      const contextInfo = data.contextInfo || {};
      const contextParticipant = contextInfo.participant || '';
      
      // Get sender field (some Evolution versions use this for ads)
      const sender = payload.sender || '';
      
      // Get data.sender field (alternative location in some API versions)
      const dataSender = data.sender || '';
      
      // Get pushName for last-resort phone extraction (some rare cases)
      const pushNameRaw = data.pushName || '';
      const pushNamePhone = pushNameRaw.match(/^\+?(\d{10,15})$/)?.[1] || '';
      
      console.log(`[AD-DEBUG] Checking all JID sources:`);
      console.log(`  remoteJid=${remoteJid}`);
      console.log(`  remoteJidAlt=${remoteJidAlt}`);
      console.log(`  participant=${participant}`);
      console.log(`  participantAlt=${participantAlt}`);
      console.log(`  contextInfo.participant=${contextParticipant}`);
      console.log(`  payload.sender=${sender}`);
      console.log(`  data.sender=${dataSender}`);
      console.log(`  pushName=${pushNameRaw} (extracted phone: ${pushNamePhone})`);
      console.log(`  addressingMode=${key.addressingMode || 'none'}`);
      
      // isValidPhoneJid is defined above (before group check)
      
      // Priority order: participantAlt > remoteJid > remoteJidAlt > participant > contextInfo
      // participantAlt is prioritized because it often has the real phone for ad messages
      
      // 1. Try participantAlt FIRST (most reliable for Facebook ad messages)
      if (isValidPhoneJid(participantAlt)) {
        jidForPhone = participantAlt;
        phoneSource = 'participantAlt';
        console.log(`[AD-LEAD] Found phone in participantAlt: ${participantAlt}`);
      }
      // 2. Try remoteJid with @s.whatsapp.net
      else if (isValidPhoneJid(remoteJid)) {
        jidForPhone = remoteJid;
        phoneSource = 'remoteJid';
      } 
      // 3. Try remoteJidAlt with @s.whatsapp.net
      else if (isValidPhoneJid(remoteJidAlt)) {
        jidForPhone = remoteJidAlt;
        phoneSource = 'remoteJidAlt';
      }
      // 4. Try participant (for ads/group-like messages where remoteJid is @lid)
      else if (isValidPhoneJid(participant)) {
        jidForPhone = participant;
        phoneSource = 'participant';
      }
      // 5. Try contextInfo.participant (another source for ad messages)
      else if (isValidPhoneJid(contextParticipant)) {
        jidForPhone = contextParticipant;
        phoneSource = 'contextInfo.participant';
      }
      // 6. Try data.sender (some Evolution versions put it here)
      else if (isValidPhoneJid(dataSender)) {
        jidForPhone = dataSender;
        phoneSource = 'data.sender';
      }
      // 7. Try payload.sender (fallback for some Evolution versions)
      else if (isValidPhoneJid(sender)) {
        jidForPhone = sender;
        phoneSource = 'payload.sender';
      }
      
      // If we have @lid remoteJid but no valid phone yet, this is likely an ad message
      // Log extra debug info to help diagnose
      if (!jidForPhone && remoteJid.includes('@lid')) {
        console.log(`[AD-MESSAGE] Detected @lid message (likely from ad/CTWA), searching for phone...`);
        console.log(`  Full data object keys: ${Object.keys(data).join(', ')}`);
        console.log(`  Full key object: ${JSON.stringify(key)}`);
        console.log(`  Full contextInfo: ${JSON.stringify(contextInfo)}`);
        
        // Try to find phone in any nested field
        const findPhoneInObject = (obj: any, path: string = ''): string | null => {
          if (!obj || typeof obj !== 'object') return null;
          
          for (const [k, v] of Object.entries(obj)) {
            if (typeof v === 'string' && v.includes('@s.whatsapp.net') && isValidPhoneJid(v)) {
              console.log(`[AD-MESSAGE] Found phone at ${path}.${k}: ${v}`);
              return v;
            }
            if (typeof v === 'object' && v !== null) {
              const found = findPhoneInObject(v, `${path}.${k}`);
              if (found) return found;
            }
          }
          return null;
        };
        
        const foundPhone = findPhoneInObject(data, 'data');
        if (foundPhone) {
          jidForPhone = foundPhone;
          phoneSource = 'deep_search';
          console.log(`[AD-MESSAGE] Deep search found phone: ${foundPhone}`);
        }
      }
      
      // 8. Last resort: try to extract phone from pushName if it looks like a phone number
      if (!jidForPhone && pushNamePhone) {
        jidForPhone = `${pushNamePhone}@s.whatsapp.net`;
        phoneSource = 'pushName_extracted';
        console.log(`[AD-MESSAGE] Last resort: extracted phone from pushName: ${pushNamePhone}`);
      }
      
      // === LID-ONLY HANDLING ===
      // If no valid phone JID found but we have a @lid remoteJid, DON'T skip!
      // Save the contact using the LID as identifier so messages still appear
      let phone = '';
      let useLidAsFallback = false;
      let lidRemoteJid = '';
      
      if (!jidForPhone) {
        // Check if this is a @lid message (common for ad leads without phone disclosure)
        if (remoteJid.includes('@lid') || participant.includes('@lid') || remoteJidAlt?.includes('@lid')) {
          // Priority for LID: remoteJidAlt > remoteJid > participant (some versions put it differently)
          if (remoteJidAlt?.includes('@lid')) {
            lidRemoteJid = remoteJidAlt;
          } else if (remoteJid.includes('@lid')) {
            lidRemoteJid = remoteJid;
          } else {
            lidRemoteJid = participant;
          }
          const lidId = lidRemoteJid.split('@')[0];
          
          console.log(`[LID-ONLY] No phone found but have @lid: ${lidRemoteJid}`);
          console.log(`[LID-ONLY] Using LID as contact identifier: ${lidId}`);
          
          // Validate LID format: should be a numeric string, typically 15-20 digits
          // Skip if it looks like an invalid or garbage ID
          if (!/^\d{10,25}$/.test(lidId)) {
            console.log(`[LID-ONLY] Invalid LID format: ${lidId}, skipping`);
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'invalid_lid_format' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          // Use the LID as the "phone" - it's a long numeric ID
          phone = lidId;
          phoneSource = 'lid_fallback';
          useLidAsFallback = true;
          
          // Log to database for monitoring
          await logIngestEvent(supabaseClient, {
            reason: 'lid_only_no_phone',
            remoteJid: lidRemoteJid,
            phoneSource: 'lid_fallback',
            payloadSnippet: { 
              remoteJid, 
              remoteJidAlt, 
              participant, 
              participantAlt, 
              addressingMode: key.addressingMode,
              pushName: pushNameRaw
            },
            eventType: 'skip', // logged as skip for tracking but we'll process it
          });
        } else {
          // No @lid either - save the full payload for debugging and continue trying
          const payloadHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
          const hashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
          
          console.error(`[CRITICAL-SKIP] No valid phone found - hash: ${hashHex}`);
          console.error(`[CRITICAL-SKIP] All sources checked:`);
          console.error(`  remoteJid=${remoteJid}`);
          console.error(`  remoteJidAlt=${remoteJidAlt}`);
          console.error(`  participant=${participant}`);
          console.error(`  participantAlt=${participantAlt}`);
          console.error(`  contextParticipant=${contextParticipant}`);
          console.error(`  sender=${sender}`);
          console.error(`  dataSender=${dataSender}`);
          console.error(`  pushName=${pushNameRaw}`);
          console.error(`  addressingMode=${key.addressingMode || 'none'}`);
          
          // SAVE TO webhook_failed_messages for debugging
          await saveFailedMessage(supabaseClient, {
            instanceName: instanceName,
            eventType: event || 'messages.upsert',
            discardReason: 'no_valid_phone_jid',
            payload: payload,
            remoteJid: remoteJid || remoteJidAlt || 'none',
          });
          
          await logIngestEvent(supabaseClient, {
            reason: 'no_valid_phone_jid',
            remoteJid: remoteJid || remoteJidAlt || 'none',
            phoneSource: 'none',
            payloadHash: hashHex,
            payloadSnippet: { remoteJid, remoteJidAlt, participant, participantAlt, addressingMode: key.addressingMode },
            eventType: 'skip',
          });
          
          return new Response(JSON.stringify({ 
            success: true, 
            skipped: true, 
            reason: 'no_valid_phone_jid',
            hash: hashHex,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        // Normal case: we have a valid phone JID
        const rawPhone = jidForPhone.split('@')[0];
        phone = rawPhone.replace(/\D/g, '');
        
        console.log(`Phone extraction: jidForPhone=${jidForPhone}, extracted=${phone}`);
        
        // Validate phone is 10-15 digits (international numbers can have up to 15 digits per E.164)
        if (!/^\d{10,15}$/.test(phone)) {
          console.log(`[WARN] Message with invalid phone length: ${rawPhone} (${phone.length} digits)`);
          
          // SAVE TO webhook_failed_messages for debugging invalid phone lengths
          await saveFailedMessage(supabaseClient, {
            instanceName: instanceName,
            eventType: event || 'messages.upsert',
            discardReason: `invalid_phone_length_${phone.length}`,
            payload: payload,
            phoneExtracted: phone,
            remoteJid: jidForPhone,
          });
          
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'invalid_phone_length' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      console.log(`[PHONE] Using ${phoneSource} for phone extraction: ${phone}`);
      
      // Phone validation: Accept any valid E.164 format (10-15 digits) or LID
      if (!useLidAsFallback) {
        console.log(`[PHONE] Validated international phone: ${phone} (${phone.length} digits, prefix: ${phone.substring(0, 3)})`);
      } else {
        console.log(`[LID-ONLY] Using LID as identifier: ${phone} (${phone.length} chars)`);
      }
      
      // Store phone source for debugging
      const debugPhoneInfo = { phone, phoneSource, length: phone.length, prefix: phone.substring(0, 3), isLid: useLidAsFallback };
      
      // Extract message content - Evolution API v2 structure
      // Use unwrapMessageContainer to handle nested wrappers (ephemeral, viewOnce, etc.)
      // and extractMessageContent to get content from various message formats
      const rawMsgContent = data.message || {};
      const msgContent = unwrapMessageContainer({ message: rawMsgContent });
      
      console.log(`[PARSER] Message keys after unwrap: ${Object.keys(msgContent || {}).filter(k => !['messageContextInfo', 'messageSecret'].includes(k)).join(', ')}`);
      
      const extracted = extractMessageContent(msgContent);
      let content = extracted.content;
      let messageType = extracted.messageType;
      let mediaUrl = extracted.mediaUrl;
      
      // pushName is at data root level in Evolution API v2
      // CRITICAL: For outbound messages (fromMe=true), pushName is the SENDER's name (the instance)
      // NOT the contact's name. We should NOT use pushName to update contact name for outbound messages.
      const rawPushName = data.pushName || null;
      const pushName = isFromMe ? null : rawPushName; // Only use pushName for inbound messages

      console.log(`Processing message from ${phone}: ${messageType} - ${content?.substring(0, 50)} (fromMe=${isFromMe}, pushName=${rawPushName})`);

      // Find the instance in our database (including label and phone for pushName validation)
      const { data: instanceData, error: instanceError } = await supabaseClient
        .from('maturador_instances')
        .select('id, user_id, label, instance_name, phone_number')
        .eq('instance_name', instance)
        .single();

      if (instanceError || !instanceData) {
        console.log('Instance not found:', instance);
        return new Response(JSON.stringify({ success: false, error: 'Instance not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userId = instanceData.user_id;
      const instanceId = instanceData.id;

      // === CRITICAL: Download media via Evolution API ===
      // WhatsApp NEVER sends media URL in the payload - only metadata (mediaKey, fileSha256, etc.)
      // We MUST actively download the media using Evolution API's getBase64FromMediaMessage
      const remoteJidForMedia = jidForPhone || (useLidAsFallback ? lidRemoteJid : `${phone}@s.whatsapp.net`);
      const isMediaMessage = ['image', 'audio', 'video', 'document', 'sticker'].includes(messageType);
      let mediaPending = false;
      
      if (isMediaMessage) {
        console.log(`[MEDIA] Detected ${messageType} message, attempting to download...`);
        
        // ALWAYS try Evolution API first (most reliable method for WhatsApp media)
        if (instance && remoteJidForMedia && messageId) {
          console.log(`[MEDIA] Calling Evolution API getBase64FromMediaMessage: instance=${instance}, remoteJid=${remoteJidForMedia}, messageId=${messageId}`);
          
          const evolutionResult = await downloadMediaViaEvolutionAPI(
            instance,
            remoteJidForMedia,
            messageId
          );
          
          if (evolutionResult) {
            console.log(`[MEDIA] Evolution API SUCCESS: mimetype=${evolutionResult.mimetype}, size=${evolutionResult.base64.length} chars`);
            
            // Decode base64 and upload to storage
            try {
              const binaryString = atob(evolutionResult.base64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const arrayBuffer = bytes.buffer;
              
              // Determine extension from mimetype
              const ext = guessExtension(evolutionResult.mimetype, (() => {
                switch (messageType) {
                  case 'image': return 'jpg';
                  case 'audio': return 'ogg';
                  case 'video': return 'mp4';
                  case 'sticker': return 'webp';
                  case 'document': return 'bin';
                  default: return 'bin';
                }
              })());
              
              const objectPath = `inbox-media/${userId}/${instanceId}/${messageType}/${messageId}.${ext}`;
              const blob = new Blob([arrayBuffer], { type: evolutionResult.mimetype || 'application/octet-stream' });
              
              console.log(`[MEDIA] Uploading to storage: ${objectPath}`);
              
              const { error: uploadError } = await supabaseClient
                .storage
                .from(INBOX_MEDIA_BUCKET)
                .upload(objectPath, blob, {
                  contentType: evolutionResult.mimetype || undefined,
                  upsert: true,
                  cacheControl: '31536000',
                });
              
              if (!uploadError) {
                const { data: urlData } = await supabaseClient.storage.from(INBOX_MEDIA_BUCKET).getPublicUrl(objectPath);
                if (urlData?.publicUrl) {
                  mediaUrl = urlData.publicUrl;
                  console.log(`[MEDIA] SUCCESS: ${mediaUrl}`);
                }
              } else {
                console.error(`[MEDIA] Upload error:`, uploadError);
                mediaPending = true;
              }
            } catch (decodeErr) {
              console.error(`[MEDIA] Base64 decode error:`, decodeErr);
              mediaPending = true;
            }
          } else {
            console.log(`[MEDIA] Evolution API FAILED - marking as pending for later retry`);
            mediaPending = true;
          }
        } else {
          console.log(`[MEDIA] Missing params for Evolution API: instance=${instance}, remoteJid=${remoteJidForMedia}, messageId=${messageId}`);
          mediaPending = true;
        }
        
        // Fallback: try direct download if we have a URL (rare but possible)
        if (!mediaUrl && extracted.mediaUrl) {
          console.log(`[MEDIA] Fallback: trying direct download from ${extracted.mediaUrl.substring(0, 50)}...`);
          const persistedUrl = await persistMediaToStorage(supabaseClient, {
            url: extracted.mediaUrl,
            userId,
            instanceId,
            messageType,
            messageId,
            fileName: messageType === 'document' ? content : null,
            instanceName: instance,
            remoteJid: remoteJidForMedia,
          });
          if (persistedUrl) {
            mediaUrl = persistedUrl;
            mediaPending = false;
          }
        }
      }
      
      // Get instance identifiers to check for suspicious pushName
      const normalizeComparable = (value: string): string => {
        return value
          .toLowerCase()
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z]/g, '');
      };

      const instanceLabelNorm = normalizeComparable(instanceData.label || '');
      const instanceNameNorm = normalizeComparable(instanceData.instance_name || '');

      // Function to check if pushName is suspicious (matches instance name/label)
      const isSuspiciousPushName = (name: string | null): boolean => {
        if (!name) return true;
        const nameNorm = normalizeComparable(name);
        if (!nameNorm) return true;

        // Check if pushName matches/contains instance label/name (normalized)
        if (instanceLabelNorm && (nameNorm === instanceLabelNorm || nameNorm.includes(instanceLabelNorm) || instanceLabelNorm.includes(nameNorm))) {
          console.log(`Suspicious pushName detected: "${name}" matches instance label "${instanceData.label}"`);
          return true;
        }
        if (instanceNameNorm && (nameNorm === instanceNameNorm || nameNorm.includes(instanceNameNorm) || instanceNameNorm.includes(nameNorm))) {
          console.log(`Suspicious pushName detected: "${name}" matches instance name "${instanceData.instance_name}"`);
          return true;
        }
        return false;
      };

      // Validate pushName - only use it if it's not suspicious
      const validPushName = pushName && !isSuspiciousPushName(pushName) ? pushName : null;

      // === BRAZILIAN PHONE NUMBER NORMALIZATION ===
      // Brazilian mobile numbers can have 11 digits (with the extra 9) or 10 digits (without)
      // DDDs are 2 digits (11-99), and mobile numbers after DDD can be 8 or 9 digits
      // We need to search for both variations to handle inconsistencies
      const validBrazilianDDDs = [
        '11', '12', '13', '14', '15', '16', '17', '18', '19', // São Paulo
        '21', '22', '24', // Rio de Janeiro
        '27', '28', // Espírito Santo
        '31', '32', '33', '34', '35', '37', '38', // Minas Gerais
        '41', '42', '43', '44', '45', '46', // Paraná
        '47', '48', '49', // Santa Catarina
        '51', '53', '54', '55', // Rio Grande do Sul
        '61', // Distrito Federal
        '62', '64', // Goiás
        '63', // Tocantins
        '65', '66', // Mato Grosso
        '67', // Mato Grosso do Sul
        '68', // Acre
        '69', // Rondônia
        '71', '73', '74', '75', '77', // Bahia
        '79', // Sergipe
        '81', '87', // Pernambuco
        '82', // Alagoas
        '83', // Paraíba
        '84', // Rio Grande do Norte
        '85', '88', // Ceará
        '86', '89', // Piauí
        '91', '93', '94', // Pará
        '92', '97', // Amazonas
        '95', // Roraima
        '96', // Amapá
        '98', '99', // Maranhão
      ];
      
      // Generate phone variations for Brazilian numbers
      const getPhoneVariations = (phoneNum: string): string[] => {
        const variations: string[] = [phoneNum];
        
        // Only process Brazilian numbers (starting with 55)
        if (!phoneNum.startsWith('55')) {
          return variations;
        }
        
        const withoutCountry = phoneNum.slice(2); // Remove '55'
        const ddd = withoutCountry.slice(0, 2);
        const restOfNumber = withoutCountry.slice(2);
        
        // Check if it's a valid Brazilian DDD
        if (!validBrazilianDDDs.includes(ddd)) {
          return variations;
        }
        
        // If number has 9 digits after DDD (total 13 with 55), try without the 9
        // Format: 55 + DDD(2) + 9 + number(8) = 13 digits
        if (phoneNum.length === 13 && restOfNumber.startsWith('9')) {
          const without9 = '55' + ddd + restOfNumber.slice(1);
          variations.push(without9);
          console.log(`[PHONE-NORM] Brazilian number with 9: ${phoneNum} -> also try: ${without9}`);
        }
        
        // If number has 8 digits after DDD (total 12 with 55), try with the 9
        // Format: 55 + DDD(2) + number(8) = 12 digits
        if (phoneNum.length === 12 && !restOfNumber.startsWith('9')) {
          const with9 = '55' + ddd + '9' + restOfNumber;
          variations.push(with9);
          console.log(`[PHONE-NORM] Brazilian number without 9: ${phoneNum} -> also try: ${with9}`);
        }
        
        return variations;
      };
      
      const phoneVariations = getPhoneVariations(phone);
      console.log(`[PHONE-NORM] Searching for contact with variations: ${phoneVariations.join(', ')}`);

      // Find or create contact - search by user_id + instance_id + phone variations
      // This allows SEPARATE chats per instance for the same phone number
      let contact: any = null;
      let contactError: any = null;
      
      // Search with all phone variations
      const { data: contactResults, error: searchError } = await supabaseClient
        .from('inbox_contacts')
        .select('*')
        .eq('user_id', userId)
        .eq('instance_id', instanceId)
        .in('phone', phoneVariations);
      
      contactError = searchError;
      
      if (contactResults && contactResults.length > 0) {
        // If found, use the first match
        contact = contactResults[0];
        
        // If the stored phone is different from the incoming phone, update it
        if (contact.phone !== phone) {
          console.log(`[PHONE-NORM] Updating contact ${contact.id} phone from ${contact.phone} to ${phone}`);
          await supabaseClient
            .from('inbox_contacts')
            .update({ phone })
            .eq('id', contact.id);
          contact.phone = phone;
        }
      }

      // === HEALING: Check for orphan contact with null instance_id ===
      if (!contact) {
        const { data: orphanContact } = await supabaseClient
          .from('inbox_contacts')
          .select('*')
          .eq('user_id', userId)
          .is('instance_id', null)
          .eq('phone', phone)
          .maybeSingle();
        
        if (orphanContact) {
          console.log(`[HEALING] Found orphan contact ${orphanContact.id} with null instance_id, adopting to instance ${instanceId}`);
          
          // Determine the best remote_jid to store
          let remoteJidToStore = remoteJid;
          if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
            remoteJidToStore = remoteJidAlt;
          } else if (!remoteJid.includes('@s.whatsapp.net') && remoteJidAlt) {
            remoteJidToStore = remoteJidAlt;
          }
          
          // Update the orphan contact with instance_id
          await supabaseClient
            .from('inbox_contacts')
            .update({ 
              instance_id: instanceId,
              remote_jid: remoteJidToStore || orphanContact.remote_jid
            })
            .eq('id', orphanContact.id);
          
          contact = { ...orphanContact, instance_id: instanceId, remote_jid: remoteJidToStore || orphanContact.remote_jid };
          console.log(`[HEALING] Orphan contact ${contact.id} adopted successfully`);
        }
      }

      if (!contact) {
        // Determine the best remote_jid to store
        // Priority: jidForPhone (if valid @s.whatsapp.net) > participantAlt > remoteJid > lidRemoteJid
        let remoteJidToStore = '';
        if (jidForPhone && jidForPhone.includes('@s.whatsapp.net')) {
          remoteJidToStore = jidForPhone;
        } else if (participantAlt && participantAlt.includes('@s.whatsapp.net')) {
          remoteJidToStore = participantAlt;
        } else if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
          remoteJidToStore = remoteJidAlt;
        } else if (remoteJid && remoteJid.includes('@s.whatsapp.net')) {
          remoteJidToStore = remoteJid;
        } else if (useLidAsFallback && lidRemoteJid) {
          // For LID-only contacts, store the @lid as remote_jid for replies
          remoteJidToStore = lidRemoteJid;
        } else if (remoteJid) {
          remoteJidToStore = remoteJid;
        }
        
        // For LID-only contacts, name is null (will show as "Desconhecido" in UI)
        const contactName = useLidAsFallback ? null : validPushName;

        // Create new contact using upsert to handle race conditions
        const { data: newContact, error: insertError } = await supabaseClient
          .from('inbox_contacts')
          .upsert({
            user_id: userId,
            instance_id: instanceId,
            phone,
            name: contactName,
            status: 'active',
            unread_count: 1,
            last_message_at: new Date().toISOString(),
            remote_jid: remoteJidToStore || null,
          }, {
            onConflict: 'user_id,instance_id,phone',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating contact:', insertError);
          // Try to fetch existing contact in case of race condition
          const { data: existingContact } = await supabaseClient
            .from('inbox_contacts')
            .select('*')
            .eq('user_id', userId)
            .eq('instance_id', instanceId)
            .eq('phone', phone)
            .single();
          
          if (existingContact) {
            contact = existingContact;
          } else {
            return new Response(JSON.stringify({ success: false, error: 'Failed to create contact' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          contact = newContact;
          console.log(`Created contact with remote_jid: ${remoteJidToStore}, isLid: ${useLidAsFallback}`);
        }
      } else {
        // Update existing contact - BUT NOT last_message_at yet (will update after message is saved)
        const updates: Record<string, any> = {};
        
        // Only increment unread for inbound messages (not fromMe)
        if (!isFromMe) {
          updates.unread_count = (contact.unread_count || 0) + 1;
        }
        
        // Only update name for INBOUND messages (not fromMe)
        // For outbound, pushName is the sender (our chip), not the contact
        if (!isFromMe && validPushName && validPushName.trim() && (!contact.name || contact.name !== validPushName)) {
          updates.name = validPushName;
        }
        
        // LID Healing: If contact has LID-like phone and we now have a real phone from participantAlt, update it
        const contactPhoneLooksLikeLid = contact.phone && (contact.phone.length < 10 || /^\d{15,}$/.test(contact.phone));
        if (contactPhoneLooksLikeLid && phone && phone.length >= 10 && phone.length <= 15) {
          console.log(`[LID-HEALING] Updating contact ${contact.id} phone from ${contact.phone} to ${phone}`);
          updates.phone = phone;
        }

        // Update remote_jid if not already set
        if (!contact.remote_jid) {
          let remoteJidToStore = remoteJid;
          if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
            remoteJidToStore = remoteJidAlt;
          } else if (!remoteJid.includes('@s.whatsapp.net') && remoteJidAlt) {
            remoteJidToStore = remoteJidAlt;
          }
          if (remoteJidToStore) {
            updates.remote_jid = remoteJidToStore;
            console.log(`[WEBHOOK] Updating contact ${contact.id} with remote_jid: ${remoteJidToStore}`);
          }
        }
        
        // Only update if there are changes (don't update last_message_at here)
        if (Object.keys(updates).length > 0) {
          await supabaseClient
            .from('inbox_contacts')
            .update(updates)
            .eq('id', contact.id);
        }
      }

      // Determine message direction based on fromMe flag
      const direction = isFromMe ? 'outbound' : 'inbound';
      
      // For outbound messages (isFromMe), check if this message was already saved by the flow processor
      if (isFromMe && messageId) {
        const { data: existingFlowMessage } = await supabaseClient
          .from('inbox_messages')
          .select('id')
          .eq('remote_message_id', messageId)
          .maybeSingle();
        
        if (existingFlowMessage) {
          console.log('Skipping duplicate outbound message (already saved by flow):', messageId);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'already_exists' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // Check if message with this remote_message_id already exists
      if (messageId) {
        const { data: existingMsg } = await supabaseClient
          .from('inbox_messages')
          .select('id')
          .eq('remote_message_id', messageId)
          .maybeSingle();
        
        if (existingMsg) {
          console.log('[WEBHOOK] Message already exists, skipping:', messageId);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'duplicate_message' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Save the message using insert
      const { data: savedMessage, error: messageError } = await supabaseClient
        .from('inbox_messages')
        .insert({
          contact_id: contact.id,
          instance_id: instanceId,
          user_id: userId,
          direction,
          message_type: messageType,
          content,
          media_url: mediaUrl,
          media_pending: mediaPending, // Flag for later retry if media download failed
          remote_message_id: messageId,
          status: isFromMe ? 'sent' : 'delivered',
          is_from_flow: false,
        })
        .select('id')
        .maybeSingle();

      if (messageError) {
        // If it's a duplicate error, just log and continue
        if (messageError.code === '23505') {
          console.log('[WEBHOOK] Duplicate message (race condition), skipping:', messageId);
        } else {
          console.error('[WEBHOOK] Error saving message:', messageError);
          return new Response(JSON.stringify({ success: false, error: 'Failed to save message' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Only update contact's last_message_at AFTER message was saved successfully
      if (savedMessage) {
        await supabaseClient
          .from('inbox_contacts')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', contact.id);
        console.log('[WEBHOOK] Message saved successfully, contact last_message_at updated');
      }

      // === ADS LEAD TRACKING ===
      // Check if this WhatsApp number is being monitored for ads leads
      if (!isFromMe) {
        try {
          const { data: monitoredNumber } = await supabaseClient
            .from('ads_whatsapp_numbers')
            .select('id, user_id')
            .eq('instance_id', instanceId)
            .eq('is_active', true)
            .maybeSingle();

          if (monitoredNumber) {
            console.log(`[ADS LEAD] Monitored number found for instance ${instanceId}`);
            
            // Extract ctwa_clid from message content (Click-to-WhatsApp tracking ID)
            // Format: ctwa_clid=XXXXXXXX or referral data
            let ctwaClid: string | null = null;
            let fbclid: string | null = null;
            
            let ctwaSource = 'none';
            let fbclidSource = 'none';
            
            // === ENHANCED CTWA/FBCLID EXTRACTION ===
            // 1. Check structured fields first (most reliable for CTWA ads)
            const referral = data.contextInfo?.externalAdReply || data.message?.contextInfo?.externalAdReply || {};
            const messageContextInfo = data.message?.extendedTextMessage?.contextInfo || data.message?.contextInfo || {};
            const externalAdReply = messageContextInfo.externalAdReply || {};
            
            // Try to extract from referral/externalAdReply (Meta's official structure)
            if (referral.containsAutoReply !== undefined || externalAdReply.sourceUrl) {
              console.log(`[ADS LEAD] Found externalAdReply structure:`, JSON.stringify({ referral, externalAdReply }));
            }
            
            // Extract source_url from various locations
            const sourceUrls = [
              referral.sourceUrl,
              externalAdReply.sourceUrl,
              messageContextInfo.sourceUrl,
              data.contextInfo?.sourceUrl,
            ].filter(Boolean);
            
            // Parse URLs for tracking parameters
            for (const url of sourceUrls) {
              try {
                const urlObj = new URL(url);
                const params = urlObj.searchParams;
                
                if (!ctwaClid && params.get('ctwa_clid')) {
                  ctwaClid = params.get('ctwa_clid');
                  ctwaSource = 'url_param';
                  console.log(`[ADS LEAD] Extracted ctwa_clid from URL: ${ctwaClid}`);
                }
                if (!fbclid && params.get('fbclid')) {
                  fbclid = params.get('fbclid');
                  fbclidSource = 'url_param';
                  console.log(`[ADS LEAD] Extracted fbclid from URL: ${fbclid}`);
                }
              } catch (e) {
                // Invalid URL, skip
              }
            }
            
            // 2. Check for referral data (Facebook Ads referral structure)
            const referralData = data.referral || data.message?.referral || messageContextInfo.referral || {};
            if (!ctwaClid && referralData.ctwa_clid) {
              ctwaClid = referralData.ctwa_clid;
              ctwaSource = 'referral_data';
              console.log(`[ADS LEAD] Extracted ctwa_clid from referral: ${ctwaClid}`);
            }
            if (!fbclid && referralData.fbclid) {
              fbclid = referralData.fbclid;
              fbclidSource = 'referral_data';
              console.log(`[ADS LEAD] Extracted fbclid from referral: ${fbclid}`);
            }
            
            // 3. Check for headline/body that might contain tracking info
            const adTitle = referral.title || externalAdReply.title || '';
            const adBody = referral.body || externalAdReply.body || '';
            
            // 4. Deep search in entire data object for ctwa_clid
            if (!ctwaClid) {
              const findCtwaInObject = (obj: any, path: string = ''): string | null => {
                if (!obj || typeof obj !== 'object') return null;
                for (const [k, v] of Object.entries(obj)) {
                  if (k === 'ctwa_clid' && typeof v === 'string') {
                    console.log(`[ADS LEAD] Deep search found ctwa_clid at ${path}.${k}`);
                    return v;
                  }
                  if (typeof v === 'object' && v !== null) {
                    const found = findCtwaInObject(v, `${path}.${k}`);
                    if (found) return found;
                  }
                }
                return null;
              };
              const deepCtwa = findCtwaInObject(data, 'data');
              if (deepCtwa) {
                ctwaClid = deepCtwa;
                ctwaSource = 'deep_search';
              }
            }
            
            // 5. Fallback: Check message content (text) for tracking IDs
            if (!ctwaClid) {
              const ctwaMatch = content?.match(/ctwa_clid[=:]\s*([a-zA-Z0-9_-]+)/i);
              if (ctwaMatch) {
                ctwaClid = ctwaMatch[1];
                ctwaSource = 'message_content';
                console.log(`[ADS LEAD] Extracted ctwa_clid from content: ${ctwaClid}`);
              }
            }
            
            if (!fbclid) {
              const fbclidMatch = content?.match(/fbclid[=:]\s*([a-zA-Z0-9_-]+)/i);
              if (fbclidMatch) {
                fbclid = fbclidMatch[1];
                fbclidSource = 'message_content';
                console.log(`[ADS LEAD] Extracted fbclid from content: ${fbclid}`);
              }
            }
            
            console.log(`[ADS LEAD] Final extraction: ctwa_clid=${ctwaClid || 'none'} (source: ${ctwaSource}), fbclid=${fbclid || 'none'} (source: ${fbclidSource})`);
            
            // Store extraction metadata for debugging
            const extractionMeta = { ctwaSource, fbclidSource, adTitle: adTitle?.substring(0, 50), adBody: adBody?.substring(0, 50) };
            
            // Check if lead already exists
            const { data: existingLead } = await supabaseClient
              .from('ads_whatsapp_leads')
              .select('id')
              .eq('phone', phone)
              .eq('whatsapp_number_id', monitoredNumber.id)
              .maybeSingle();

            if (!existingLead) {
              // Create new lead
              const { error: leadError } = await supabaseClient
                .from('ads_whatsapp_leads')
                .insert({
                  user_id: monitoredNumber.user_id,
                  phone,
                  name: validPushName,
                  whatsapp_number_id: monitoredNumber.id,
                  instance_id: instanceId,
                  ctwa_clid: ctwaClid,
                  fbclid: fbclid,
                  first_message: content?.substring(0, 500),
                  first_contact_at: new Date().toISOString(),
                });

              if (leadError) {
                console.error('[ADS LEAD] Error creating lead:', leadError);
              } else {
                console.log(`[ADS LEAD] New lead created for phone ${phone}`);
              }
            } else {
              console.log(`[ADS LEAD] Lead already exists for phone ${phone}`);
            }
          }
        } catch (leadTrackingError) {
          console.error('[ADS LEAD] Error in lead tracking:', leadTrackingError);
          // Don't fail the whole webhook if lead tracking fails
        }
      }

      // Skip flow processing for outbound messages (sent from WhatsApp Web/Mobile)
      if (isFromMe) {
        console.log('Outbound message saved successfully (from WhatsApp Web/Mobile)');
        return new Response(JSON.stringify({ success: true, outbound: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if flow is paused for this contact - skip all flow processing
      if (contact.flow_paused === true) {
        console.log(`Flow is paused for contact ${contact.id}, skipping all flow processing`);
        return new Response(JSON.stringify({ success: true, flowPaused: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // === FLOW SESSION HANDLING ===
      // First, check for active flow sessions waiting for input (waitInput or menu)
      const { data: activeSession } = await supabaseClient
        .from('inbox_flow_sessions')
        .select('*, flow:inbox_flows(*)')
        .eq('contact_id', contact.id)
        .eq('status', 'active')
        .order('last_interaction', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSession) {
        const flowNodes = (activeSession.flow?.nodes || []) as Array<{ id: string; type: string; data: Record<string, unknown> }>;
        const currentNode = flowNodes.find((n: { id: string }) => n.id === activeSession.current_node_id);
        
        // Check if session is currently being processed (locked)
        if (activeSession.processing) {
          const lockAge = activeSession.processing_started_at 
            ? Date.now() - new Date(activeSession.processing_started_at).getTime() 
            : 0;
          
          // If lock is not stale (less than 60 seconds), skip processing
          if (lockAge < 60000) {
            console.log(`Session ${activeSession.id} is locked (${lockAge}ms), skipping to prevent duplicate processing`);
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'session_locked' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          console.log(`Session ${activeSession.id} has stale lock (${lockAge}ms), proceeding`);
        }
        
        // Check if the current node is waiting for input
        if (currentNode && (currentNode.type === 'waitInput' || currentNode.type === 'menu')) {
          console.log(`Found active session ${activeSession.id} waiting for input at node ${currentNode.id}`);
          
          // Check if message is media without text content - if so, IGNORE it and keep waiting
          const isMediaMessage = ['image', 'audio', 'video', 'document', 'sticker'].includes(messageType);
          const hasTextContent = content && content.trim().length > 0;
          
          if (isMediaMessage && !hasTextContent) {
            console.log(`[WAIT_INPUT] Ignoring media message (${messageType}) without caption - flow continues waiting for text input`);
            return new Response(JSON.stringify({ 
              success: true, 
              skipped: true, 
              reason: 'ignored_media_while_waiting_input',
              messageType,
              sessionId: activeSession.id
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          console.log(`[WAIT_INPUT] Valid input received: ${messageType} with content: "${content?.substring(0, 50)}"`);
          
          // Cancel any pending timeout job for this session
          const { error: cancelError } = await supabaseClient
            .from('inbox_flow_delay_jobs')
            .update({ 
              status: 'done',
              updated_at: new Date().toISOString()
            })
            .eq('session_id', activeSession.id)
            .eq('status', 'scheduled');
          
          if (cancelError) {
            console.error('Error canceling timeout job:', cancelError);
          } else {
            console.log('Timeout job canceled (if any)');
          }
          
          // Clear timeout_at from session
          await supabaseClient
            .from('inbox_flow_sessions')
            .update({ timeout_at: null })
            .eq('id', activeSession.id);
          
          // Process the user's input and continue the flow
          try {
            const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
            const processResponse = await fetch(processUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ sessionId: activeSession.id, userInput: content }),
            });
            
            if (!processResponse.ok) {
              const errorText = await processResponse.text();
              console.error('Error processing user input:', errorText);
            } else {
              console.log('User input processed, flow continued');
            }
          } catch (flowError) {
            console.error('Error calling process-inbox-flow for input:', flowError);
          }
          
          // Don't trigger new flows since we're continuing an existing one
          console.log('Message processed successfully (continuing flow)');
          return new Response(JSON.stringify({ success: true, flowContinued: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // === FLOW TRIGGER LOGIC ===
      // Fetch all active flows for this user
      const { data: flows, error: flowsError } = await supabaseClient
        .from('inbox_flows')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      console.log(`[FLOW DEBUG] Found ${flows?.length || 0} active flows for user ${userId}`);
      if (flowsError) {
        console.error('[FLOW DEBUG] Error fetching flows:', flowsError);
      }

      if (!flows || flows.length === 0) {
        console.log('[FLOW DEBUG] No active flows found, message saved without flow trigger');
        return new Response(JSON.stringify({ success: true, noActiveFlows: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if message has text content for keyword matching
      const hasTextContent = content && content.trim() !== '';
      if (!hasTextContent) {
        console.log('[FLOW DEBUG] Message has no text content (type=' + messageType + '), skipping keyword flow trigger');
        return new Response(JSON.stringify({ success: true, noContent: true, messageType }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get all active sessions for this contact
      const { data: allActiveSessions } = await supabaseClient
        .from('inbox_flow_sessions')
        .select('id, started_at, current_node_id, flow_id, variables')
        .eq('contact_id', contact.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false });

      // Count total messages from this contact to determine if this is first message ever
      const { count: messageCount } = await supabaseClient
        .from('inbox_messages')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', contact.id)
        .eq('direction', 'inbound');
      
      const isFirstMessageEver = (messageCount || 0) <= 1;
      console.log(`[FLOW DEBUG] Contact ${contact.id} message count: ${messageCount}, isFirstMessageEver: ${isFirstMessageEver}`);

      // Check if any keyword flow matches first - keyword flows have priority and always restart
      let keywordFlowToTrigger: typeof flows[0] | null = null;
      const lowerContent = content.toLowerCase();
      
      for (const flow of flows) {
        if (flow.trigger_type !== 'keyword') continue;
        
        // Check instance assignment
        const assignedInstances = flow.assigned_instances as string[] || [];
        if (assignedInstances.length > 0 && !assignedInstances.includes(instanceId)) {
          console.log(`[FLOW DEBUG] Keyword flow "${flow.name}" NOT assigned to instance ${instanceId}, skipping`);
          continue;
        }
        
        const keywords = flow.trigger_keywords as string[] || [];
        if (keywords.length === 0) {
          console.log(`[FLOW DEBUG] Keyword flow "${flow.name}" has NO keywords configured, skipping`);
          continue;
        }
        
        console.log(`[FLOW DEBUG] Checking keywords: ${JSON.stringify(keywords)} against content: "${lowerContent}"`);
        for (const kw of keywords) {
          if (lowerContent.includes(kw.toLowerCase())) {
            console.log(`[FLOW DEBUG] KEYWORD MATCH! Flow "${flow.name}" triggered by keyword "${kw}"`);
            keywordFlowToTrigger = flow;
            break;
          }
        }
        if (keywordFlowToTrigger) break;
      }

      // If a keyword flow matches, it ALWAYS triggers (restarts from beginning)
      // This cancels any existing sessions and starts fresh
      if (keywordFlowToTrigger) {
        console.log(`[FLOW DEBUG] === KEYWORD FLOW TRIGGER: "${keywordFlowToTrigger.name}" ===`);
        
        // Cancel ALL active sessions for this contact (keyword triggers always restart)
        if (allActiveSessions && allActiveSessions.length > 0) {
          console.log(`[FLOW DEBUG] Canceling ${allActiveSessions.length} active session(s) for keyword restart`);
          for (const session of allActiveSessions) {
            // Cancel any pending delay jobs
            await supabaseClient
              .from('inbox_flow_delay_jobs')
              .update({ status: 'cancelled' })
              .eq('session_id', session.id)
              .eq('status', 'pending');
            
            // Mark session as completed
            await supabaseClient
              .from('inbox_flow_sessions')
              .update({ status: 'completed' })
              .eq('id', session.id);
            console.log(`[FLOW DEBUG] Canceled session ${session.id}`);
          }
        }

        // Create new session from the beginning
        const sessionPayload = {
          flow_id: keywordFlowToTrigger.id,
          contact_id: contact.id,
          instance_id: instanceId,
          user_id: userId,
          current_node_id: 'start-1',
          variables: { 
            nome: contact.name || '',
            telefone: phone,
            resposta: content,
            lastMessage: content,
            contactName: contact.name || phone,
            ultima_mensagem: content,
          },
          status: 'active',
          processing: false,
          processing_started_at: null,
        };
        
        // Use insert instead of upsert to always create new session
        const { data: newSession, error: sessionError } = await supabaseClient
          .from('inbox_flow_sessions')
          .insert(sessionPayload)
          .select()
          .single();

        if (newSession && !sessionError) {
          console.log(`[FLOW DEBUG] Keyword flow session created: ${newSession.id}`);
          try {
            const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
            const processResponse = await fetch(processUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ sessionId: newSession.id }),
            });
            
            if (!processResponse.ok) {
              const errorText = await processResponse.text();
              console.error('[FLOW DEBUG] Error executing keyword flow:', errorText);
            } else {
              console.log(`[FLOW DEBUG] Keyword flow executed successfully`);
            }
          } catch (flowError) {
            console.error('[FLOW DEBUG] Error calling process-inbox-flow:', flowError);
          }
        } else if (sessionError) {
          console.error('[FLOW DEBUG] Error creating keyword flow session:', sessionError);
        }
        
        return new Response(JSON.stringify({ success: true, keywordFlowTriggered: keywordFlowToTrigger.name }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // === No keyword flow matched - check for "all" trigger type ===
      // "All" flows only trigger ONCE per contact - checked via tags or session history
      
      // If there's an active session, don't trigger new "all" flows - let existing flow handle it
      const anyActiveSession = allActiveSessions?.[0];
      if (anyActiveSession) {
        const sessionVars = (anyActiveSession.variables || {}) as Record<string, unknown>;
        const hasPendingDelay = !!(sessionVars._pendingDelay);
        console.log(`[FLOW DEBUG] Active session ${anyActiveSession.id} exists (node: ${anyActiveSession.current_node_id}, hasPendingDelay: ${hasPendingDelay})`);
        console.log(`[FLOW DEBUG] No keyword matched, skipping "all" flow trigger due to active session`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'active_session_exists_no_keyword_match' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check for "all" trigger flows (only if no active session and no keyword matched)
      for (const flow of flows) {
        if (flow.trigger_type !== 'all') continue;
        
        console.log(`[FLOW DEBUG] Checking "all" flow "${flow.name}" (id: ${flow.id})`);
        
        // Check instance assignment
        const assignedInstances = flow.assigned_instances as string[] || [];
        if (assignedInstances.length > 0 && !assignedInstances.includes(instanceId)) {
          console.log(`[FLOW DEBUG] "All" flow "${flow.name}" NOT assigned to instance ${instanceId}, skipping`);
          continue;
        }

        // "All" flows only trigger ONCE per contact per flow - check if already triggered
        // We check for ANY session (active or completed) with this flow+contact combo
        const { data: existingSession } = await supabaseClient
          .from('inbox_flow_sessions')
          .select('id, status')
          .eq('flow_id', flow.id)
          .eq('contact_id', contact.id)
          .limit(1)
          .maybeSingle();
        
        if (existingSession) {
          console.log(`[FLOW DEBUG] "All" flow "${flow.name}" already triggered for contact (session: ${existingSession.id}, status: ${existingSession.status}), skipping`);
          continue;
        }

        console.log(`[FLOW DEBUG] === "ALL" FLOW TRIGGER: "${flow.name}" (first time for this contact) ===`);

        // Check if this is a media message and flow has pause_on_media enabled
        if ((messageType === 'image' || messageType === 'document') && flow.pause_on_media === true) {
          console.log(`Media message (${messageType}) received and flow ${flow.name} has pause_on_media enabled`);
          await supabaseClient
            .from('inbox_contacts')
            .update({ flow_paused: true })
            .eq('id', contact.id);
          console.log(`Flow paused for contact ${contact.id} due to media message`);
          return new Response(JSON.stringify({ success: true, flowPausedByMedia: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create new session for "all" flow
        const sessionPayload = {
          flow_id: flow.id,
          contact_id: contact.id,
          instance_id: instanceId,
          user_id: userId,
          current_node_id: 'start-1',
          variables: { 
            nome: contact.name || '',
            telefone: phone,
            resposta: content,
            lastMessage: content,
            contactName: contact.name || phone,
            ultima_mensagem: content,
          },
          status: 'active',
          processing: false,
          processing_started_at: null,
        };
        
        const { data: newSession, error: sessionError } = await supabaseClient
          .from('inbox_flow_sessions')
          .insert(sessionPayload)
          .select()
          .single();

        if (newSession && !sessionError) {
          console.log(`[FLOW DEBUG] "All" flow session created: ${newSession.id}`);
          try {
            const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
            const processResponse = await fetch(processUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ sessionId: newSession.id }),
            });
            
            if (!processResponse.ok) {
              const errorText = await processResponse.text();
              console.error('[FLOW DEBUG] Error executing "all" flow:', errorText);
            } else {
              console.log(`[FLOW DEBUG] "All" flow executed successfully`);
            }
          } catch (flowError) {
            console.error('[FLOW DEBUG] Error calling process-inbox-flow:', flowError);
          }
        } else if (sessionError) {
          console.error('[FLOW DEBUG] Error creating "all" flow session:', sessionError);
        }

        break; // Only trigger one "all" flow
      }
      

      console.log('Message processed successfully');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle message status updates (sent, delivered, read)
    if (event === 'messages.update' || event === 'MESSAGES_UPDATE') {
      console.log('Processing message status update');
      
      const updates = Array.isArray(data) ? data : [data];
      
      for (const update of updates) {
        const key = update.key || {};
        const remoteMessageId = key.id;
        const status = update.update?.status;
        
        if (!remoteMessageId || !status) {
          console.log('Missing remoteMessageId or status in update:', update);
          continue;
        }
        
        // Map Evolution API status to our status
        let newStatus = 'sent';
        if (status === 'DELIVERY_ACK' || status === 2 || status === 'delivered') {
          newStatus = 'delivered';
        } else if (status === 'READ' || status === 3 || status === 'read') {
          newStatus = 'read';
        } else if (status === 'PLAYED' || status === 4) {
          newStatus = 'read';
        } else if (status === 'SERVER_ACK' || status === 1 || status === 'sent') {
          newStatus = 'sent';
        }
        
        console.log(`Updating message ${remoteMessageId} status to ${newStatus}`);
        
        // Update message status in database
        const { error: updateError } = await supabaseClient
          .from('inbox_messages')
          .update({ status: newStatus })
          .eq('remote_message_id', remoteMessageId);
          
        if (updateError) {
          console.error('Error updating message status:', updateError);
        } else {
          console.log(`Message ${remoteMessageId} status updated to ${newStatus}`);
        }
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle connection status updates
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = data.state || data.status;
      console.log(`Connection update for ${instance}: ${state}`);
      
      // Update instance status
      const newStatus = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';
      
      await supabaseClient
        .from('maturador_instances')
        .update({ status: newStatus })
        .eq('instance_name', instance);

      // AUTO-CONFIGURE WEBHOOK when instance connects
      if (state === 'open') {
        console.log(`[AUTO-WEBHOOK] Instance ${instance} connected, ensuring webhook is configured`);
        
        try {
          // Get instance and user info
          const { data: instanceData } = await supabaseClient
            .from('maturador_instances')
            .select('user_id')
            .eq('instance_name', instance)
            .single();

          if (instanceData) {
            // Get user's Evolution API config
            const { data: config } = await supabaseClient
              .from('maturador_config')
              .select('*')
              .eq('user_id', instanceData.user_id)
              .maybeSingle();

            if (config) {
              const EVOLUTION_BASE_URL = config.evolution_base_url.replace(/\/$/, '');
              const EVOLUTION_API_KEY = config.evolution_api_key;
              const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-inbox-messages`;

              // Configure webhook with multiple payload formats
              const payloads = [
                {
                  url: webhookUrl,
                  enabled: true,
                  webhookByEvents: false,
                  webhookBase64: false,
                  events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE", "CONNECTION_UPDATE", "SEND_MESSAGE"]
                },
                {
                  webhook: {
                    url: webhookUrl,
                    enabled: true,
                    webhookByEvents: false,
                    events: ["messages.upsert", "messages.update", "connection.update", "send.message"]
                  }
                },
                {
                  url: webhookUrl,
                  enabled: true,
                  events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE"]
                }
              ];

              for (const payload of payloads) {
                try {
                  const setRes = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instance}`, {
                    method: 'POST',
                    headers: {
                      apikey: EVOLUTION_API_KEY,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                  });

                  if (setRes.ok) {
                    console.log(`[AUTO-WEBHOOK] Webhook configured successfully for ${instance}`);
                    break;
                  }
                } catch (webhookError) {
                  console.log(`[AUTO-WEBHOOK] Payload attempt failed for ${instance}:`, webhookError);
                }
              }
            }
          }
        } catch (autoWebhookError) {
          console.error(`[AUTO-WEBHOOK] Error configuring webhook for ${instance}:`, autoWebhookError);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle send message acknowledgment
    if (event === 'send.message' || event === 'SEND_MESSAGE') {
      console.log('Processing send message acknowledgment');
      
      const key = data.key || {};
      const remoteMessageId = key.id;
      
      if (remoteMessageId) {
        // First, check if this message already exists with a persisted media_url
        // We do NOT want to overwrite a supabase.co URL with a temporary mmg.whatsapp.net URL
        const { data: existingMessage } = await supabaseClient
          .from('inbox_messages')
          .select('id, media_url')
          .eq('remote_message_id', remoteMessageId)
          .maybeSingle();
        
        if (existingMessage) {
          const hasPersistedMedia = existingMessage.media_url && isStoredMediaUrl(existingMessage.media_url);
          
          if (hasPersistedMedia) {
            console.log(`[SEND-ACK] Message ${remoteMessageId} already has persisted media, only updating status`);
            await supabaseClient
              .from('inbox_messages')
              .update({ status: 'sent' })
              .eq('id', existingMessage.id);
          } else {
            // No persisted media - safe to update normally
            await supabaseClient
              .from('inbox_messages')
              .update({ 
                status: 'sent',
                remote_message_id: remoteMessageId 
              })
              .eq('id', existingMessage.id);
          }
        } else {
          // Message doesn't exist yet - this shouldn't happen normally
          // but log it for debugging
          console.log(`[SEND-ACK] Message ${remoteMessageId} not found in database`);
        }
          
        console.log(`Send message acknowledged: ${remoteMessageId}`);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Unhandled event type: ${event}`);
    return new Response(JSON.stringify({ success: true, event }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
