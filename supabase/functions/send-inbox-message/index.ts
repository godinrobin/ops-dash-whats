import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to persist media to Supabase Storage
async function persistMediaToStorage(
  supabaseAdmin: any,
  mediaUrl: string,
  userId: string,
  instanceId: string | null,
  mediaType: string
): Promise<string | null> {
  try {
    // Skip if already a Supabase URL
    if (mediaUrl.includes('supabase.co/storage')) {
      console.log('[MEDIA] Already a Supabase URL, skipping persistence');
      return mediaUrl;
    }

    console.log(`[MEDIA] Downloading media from: ${mediaUrl.substring(0, 100)}...`);
    
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      console.error(`[MEDIA] Failed to download media: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Determine file extension based on content type
    const extensionMap: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/opus': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'application/pdf': 'pdf',
    };

    let extension = extensionMap[contentType] || 'bin';
    
    // Try to get extension from URL if not found
    if (extension === 'bin') {
      const urlExtension = mediaUrl.split('?')[0].split('.').pop()?.toLowerCase();
      if (urlExtension && urlExtension.length <= 4) {
        extension = urlExtension;
      }
    }

    const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const folderPath = `inbox-media/${userId}/${instanceId || 'unknown'}/${mediaType}`;
    const filePath = `${folderPath}/${fileName}`;

    console.log(`[MEDIA] Uploading to storage: ${filePath} (${contentType}, ${uint8Array.length} bytes)`);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('video-clips')
      .upload(filePath, uint8Array, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[MEDIA] Upload error:', uploadError);
      return null;
    }

    const { data: publicUrl } = supabaseAdmin.storage
      .from('video-clips')
      .getPublicUrl(filePath);

    console.log(`[MEDIA] Successfully persisted: ${publicUrl.publicUrl}`);
    return publicUrl.publicUrl;
  } catch (err) {
    console.error('[MEDIA] Error persisting media:', err);
    return null;
  }
}

/**
 * Downloads a file from URL and converts to base64 data URI
 * This is needed because UazAPI cannot fetch from Supabase Storage directly (HTTP/2 protocol issues)
 */
async function urlToBase64DataUri(url: string): Promise<string | null> {
  try {
    console.log(`[BASE64] Downloading file from: ${url.substring(0, 100)}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[BASE64] Failed to download file: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = '';
    const chunkSize = 8192; // Process in chunks to avoid call stack issues
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);
    
    const dataUri = `data:${contentType};base64,${base64}`;
    console.log(`[BASE64] Converted to data URI (${uint8Array.length} bytes, ${contentType})`);
    
    return dataUri;
  } catch (error) {
    console.error(`[BASE64] Error converting URL to base64:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the JWT token from Authorization header
    const jwtAuthHeader = req.headers.get('Authorization');
    if (!jwtAuthHeader || !jwtAuthHeader.startsWith('Bearer ')) {
      console.error('[AUTH] Missing or invalid Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('[AUTH] Missing backend env vars');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate JWT via direct call (avoids relying on server-side session state)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: jwtAuthHeader,
      },
    });

    if (!userRes.ok) {
      const errText = await userRes.text().catch(() => '');
      console.error('[AUTH] JWT validation failed:', userRes.status, errText);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const user = await userRes.json() as { id?: string };
    if (!user?.id) {
      console.error('[AUTH] JWT validation failed: missing user id');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin client for database writes/reads (bypasses RLS)
    const supabaseAdmin = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[AUTH] User authenticated:', user.id);

    const { contactId, instanceName, phone, content, messageType = 'text', mediaUrl, messageId, remoteJid, replyToRemoteMessageId } = await req.json();
    
    console.log('Sending message:', { contactId, instanceName, phone, remoteJid, messageType, content: content?.substring(0, 50), messageId, replyToRemoteMessageId });

    if (!instanceName || (!phone && !remoteJid)) {
      return new Response(JSON.stringify({ error: 'Missing required fields (need phone or remoteJid)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve instance id and get API config for status updates
    const { data: instanceRow } = await supabaseAdmin
      .from('maturador_instances')
      .select('id, evolution_base_url, evolution_api_key, api_provider, uazapi_token')
      .eq('instance_name', instanceName)
      .eq('user_id', user.id)
      .maybeSingle();

    const instanceId = instanceRow?.id ?? null;
    const apiProvider = instanceRow?.api_provider || 'evolution';
    const instanceToken = instanceRow?.uazapi_token;

    // PRIORITY: 1) Instance config, 2) User config, 3) Admin config, 4) Global whatsapp_api_config, 5) Global secrets
    let API_BASE_URL = '';
    let API_KEY = '';
    let configSource = 'none';

    // For UazAPI, we need to get the base URL from whatsapp_api_config
    if (apiProvider === 'uazapi') {
      const { data: apiConfig } = await supabaseAdmin
        .from('whatsapp_api_config')
        .select('uazapi_base_url')
        .limit(1)
        .single();

      if (apiConfig?.uazapi_base_url) {
        API_BASE_URL = apiConfig.uazapi_base_url.replace(/\/$/, '');
        // IMPORTANT: for UazAPI, message sending requires the INSTANCE token (not the admin token)
        API_KEY = instanceToken || '';
        configSource = 'whatsapp_api_config';
        console.log(`[SEND-MESSAGE] UazAPI using whatsapp_api_config: ${API_BASE_URL}`);
      }
    }

    if (apiProvider === 'uazapi' && !API_KEY) {
      return new Response(JSON.stringify({
        error: 'Token da instância UazAPI não encontrado. Recrie a instância para gerar um token válido.',
        errorCode: 'UAZAPI_INSTANCE_TOKEN_MISSING',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Try instance's own config (highest priority) - for Evolution
    if (!API_BASE_URL && instanceRow?.evolution_base_url && instanceRow?.evolution_api_key) {
      API_BASE_URL = instanceRow.evolution_base_url.replace(/\/$/, '');
      API_KEY = instanceRow.evolution_api_key;
      configSource = 'instance';
      console.log(`[SEND-MESSAGE] Using instance config: ${API_BASE_URL}`);
    }
    
    // 2) Try user's own config
    if (!API_BASE_URL) {
      const { data: userConfig } = await supabaseAdmin
        .from('maturador_config')
        .select('evolution_base_url, evolution_api_key')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (userConfig?.evolution_base_url && userConfig?.evolution_api_key) {
        API_BASE_URL = userConfig.evolution_base_url.replace(/\/$/, '');
        API_KEY = userConfig.evolution_api_key;
        configSource = 'user';
        console.log(`[SEND-MESSAGE] Using user config: ${API_BASE_URL}`);
      }
    }

    // 3) Try any admin config (first available)
    if (!API_BASE_URL) {
      const { data: adminConfig } = await supabaseAdmin
        .from('maturador_config')
        .select('evolution_base_url, evolution_api_key')
        .limit(1)
        .maybeSingle();
      
      if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
        API_BASE_URL = adminConfig.evolution_base_url.replace(/\/$/, '');
        API_KEY = adminConfig.evolution_api_key;
        configSource = 'admin';
        console.log(`[SEND-MESSAGE] Using admin config: ${API_BASE_URL}`);
      }
    }

    // 4) Try global secrets
    if (!API_BASE_URL) {
      const globalBaseUrl = Deno.env.get('EVOLUTION_BASE_URL');
      const globalApiKey = Deno.env.get('EVOLUTION_API_KEY');
      
      if (globalBaseUrl && globalApiKey) {
        API_BASE_URL = globalBaseUrl.replace(/\/$/, '');
        API_KEY = globalApiKey;
        configSource = 'global';
        console.log(`[SEND-MESSAGE] Using global config: ${API_BASE_URL}`);
      }
    }

    if (!API_BASE_URL || !API_KEY) {
      console.error('[SEND-MESSAGE] No API configuration available');
      return new Response(JSON.stringify({ error: 'WhatsApp API not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[SEND-MESSAGE] Provider: ${apiProvider}, Config source: ${configSource}, URL: ${API_BASE_URL}`);

    // Determine how to send: via remoteJid (for @lid contacts) or formatted phone
    // Priority: remoteJid if it's @lid, otherwise use formatted phone
    let sendDestination = '';
    let isLidContact = false;
    
    if (remoteJid && remoteJid.includes('@lid')) {
      // For @lid contacts, send using the full remoteJid
      sendDestination = remoteJid;
      isLidContact = true;
      console.log(`[LID] Sending to @lid contact: ${remoteJid}`);
    } else if (remoteJid && remoteJid.includes('@s.whatsapp.net')) {
      // Use remoteJid phone number
      sendDestination = remoteJid.split('@')[0].replace(/\D/g, '');
      console.log(`[PHONE] Extracted phone from remoteJid: ${sendDestination}`);
    } else if (phone) {
      // Format phone number for Evolution API
      sendDestination = phone.replace(/\D/g, '');
      console.log(`[PHONE] Using provided phone: ${sendDestination}`);
    }
    
    if (!sendDestination) {
      return new Response(JSON.stringify({ error: 'Could not determine send destination' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Persist media to storage if this is a media message
    let persistedMediaUrl = mediaUrl;
    if (mediaUrl && messageType !== 'text') {
      console.log(`[MEDIA] Attempting to persist ${messageType} media before sending...`);
      const storedUrl = await persistMediaToStorage(
        supabaseAdmin,
        mediaUrl,
        user.id,
        instanceId,
        messageType
      );
      
      if (storedUrl) {
        persistedMediaUrl = storedUrl;
        
        // Update the message record with the persisted URL
        if (messageId) {
          const { error: updateMediaError } = await supabaseAdmin
            .from('inbox_messages')
            .update({ media_url: persistedMediaUrl })
            .eq('id', messageId);
          
          if (updateMediaError) {
            console.warn('[MEDIA] Failed to update message with persisted URL:', updateMediaError);
          } else {
            console.log(`[MEDIA] Updated message ${messageId} with persisted URL`);
          }
        }
      } else {
        console.warn('[MEDIA] Could not persist media, using original URL');
      }
    }


    // OPTIMIZATION: Skip WhatsApp number verification for existing contacts
    // The user is already conversing with this contact, so checking is redundant and slow
    console.log(`[SEND-MESSAGE] Skipping number verification for existing contact: ${sendDestination}`);


    // Use the persisted URL for sending
    let urlToSend = persistedMediaUrl || mediaUrl;

    // For UazAPI with media, convert URL to base64 to avoid HTTP/2 fetch issues
    if (apiProvider === 'uazapi' && urlToSend && messageType !== 'text') {
      console.log(`[UAZAPI] Converting media URL to base64 for reliable delivery...`);
      const base64Uri = await urlToBase64DataUri(urlToSend);
      if (base64Uri) {
        urlToSend = base64Uri;
        console.log(`[UAZAPI] Successfully converted to base64 data URI`);
      } else {
        console.warn(`[UAZAPI] Failed to convert to base64, falling back to URL`);
        // Keep original URL as fallback
      }
    }

    let apiEndpoint = '';
    let apiBody: Record<string, unknown> = {};
    let authHeader: Record<string, string> = {};

    // Simple POST helper
    const tryPostJson = async (endpoint: string, body: Record<string, unknown>, timeoutMs = 60000) => {
      console.log(`[${apiProvider.toUpperCase()}] POST ${API_BASE_URL}${endpoint}`);
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(tid);
        let json: any = null;
        try { json = await res.json(); } catch { json = { message: await res.text().catch(() => '') }; }
        return { res, json };
      } catch (e) {
        clearTimeout(tid);
        throw e;
      }
    };

    // Retry wrapper for media (up to 2 retries with 3s backoff)
    const tryPostWithRetry = async (endpoint: string, body: Record<string, unknown>, retries = 2) => {
      for (let i = 0; i <= retries; i++) {
        try {
          const { res, json } = await tryPostJson(endpoint, body, 120000);
          if (res.ok || (res.status < 500 && res.status !== 408)) return { res, json };
          console.warn(`[RETRY] Attempt ${i+1} failed ${res.status}`);
          if (i < retries) await new Promise(r => setTimeout(r, 3000 * (i + 1)));
          if (i === retries) return { res, json };
        } catch (err) {
          console.warn(`[RETRY] Attempt ${i+1} error:`, (err as Error).message);
          if (i === retries) throw err;
          await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        }
      }
      throw new Error('Retry exhausted');
    };


    if (apiProvider === 'uazapi') {
      // UazAPI v2 (OpenAPI):
      // - Auth header: token (instance token)
      // - Send text: POST /send/text with { number, text }
      // - Send media: POST /send/media with { number, type, file, text?, docName? }
      authHeader = { token: API_KEY };

      // Best-effort health check for easier debugging
      try {
        const health = await fetch(`${API_BASE_URL}/status`, { method: 'GET' });
        console.log(`[UAZAPI] /status -> ${health.status}`);
      } catch (e) {
        console.warn('[UAZAPI] /status check failed:', e);
      }

      let endpoint = '';
      let body: Record<string, unknown> = {};

      // UazAPI reply param: spec uses `replyid` (send/text and send/media)
      // Some docs/versions also accept `quoted`, so we send both for compatibility.
      const normalizeReplyId = (id: unknown): string | null => {
        if (!id) return null;
        const raw = String(id).trim();
        if (!raw) return null;
        if (raw.includes(':')) {
          const parts = raw.split(':').filter(Boolean);
          const last = parts[parts.length - 1];
          return last || null;
        }
        return raw;
      };

      const replyId = normalizeReplyId(replyToRemoteMessageId);

      if (messageType === 'text') {
        endpoint = '/send/text';
        body = {
          number: String(sendDestination),
          text: typeof content === 'string' ? content : String(content ?? ''),
        };

        // Reply support (quote the selected message on WhatsApp)
        if (replyId) {
          (body as any).replyid = replyId;
          (body as any).quoted = replyId;
          console.log(`[UAZAPI] Reply enabled: replyid=${replyId}`);
        }
        
        // Text messages don't need retry
        const { res: apiResponse, json: apiResult } = await tryPostJson(endpoint, body);
        console.log(`[UAZAPI] ${endpoint} -> ${apiResponse.status}`);
        console.log('API response:', JSON.stringify(apiResult, null, 2));

        if (!apiResponse.ok) {
          console.error('API error:', apiResult);

          if (messageId) {
            await supabaseAdmin
              .from('inbox_messages')
              .update({ status: 'failed' })
              .eq('id', messageId);
          }

          const errorMessage = apiResult?.error || apiResult?.message || apiResult?.response?.message;
          const errorDetails = Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage;

          let userFriendlyError = 'Falha ao enviar mensagem';
          let errorCode = 'SEND_FAILED';

          if (typeof errorDetails === 'string' && (errorDetails.includes('disconnected') || errorDetails.includes('logged out'))) {
            userFriendlyError = 'A instância do WhatsApp está desconectada. Reconecte e tente novamente.';
            errorCode = 'INSTANCE_DISCONNECTED';
          }

          if (instanceId && errorCode === 'INSTANCE_DISCONNECTED') {
            const { error: statusErr } = await supabaseAdmin
              .from('maturador_instances')
              .update({ status: 'disconnected', last_error_at: new Date().toISOString() })
              .eq('id', instanceId);
            if (statusErr) console.warn('Failed to mark instance as disconnected:', statusErr);
          }

          return new Response(JSON.stringify({
            error: userFriendlyError,
            errorCode,
            details: apiResult,
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        var finalApiResult = apiResult;
      } else {
        endpoint = '/send/media';

        // UazAPI uses 'ptt' (push-to-talk) for audio/voice messages
        const uazType =
          messageType === 'image' ? 'image'
          : messageType === 'video' ? 'video'
          : messageType === 'audio' ? 'ptt'
          : messageType === 'document' ? 'document'
          : 'document';

        // For documents and videos, try sending with URL first (smaller payload, faster)
        // Videos can be very large and base64 triples the size, causing "Invalid payload" errors
        // Only fall back to base64 if URL fails
        let sendSuccess = false;
        let apiResponse: Response | null = null;
        let apiResult: any = null;
        
        const shouldTryUrlFirst = (messageType === 'document' || messageType === 'video') && 
          persistedMediaUrl && !persistedMediaUrl.startsWith('data:');
        
        if (shouldTryUrlFirst) {
          console.log(`[UAZAPI] ${messageType} detected - trying URL first before base64`);
          
          const urlBody: Record<string, unknown> = {
            number: String(sendDestination),
            type: uazType,
            file: persistedMediaUrl,
          };

          // Reply support for media
          if (replyId) {
            (urlBody as any).replyid = replyId;
            (urlBody as any).quoted = replyId;
            console.log(`[UAZAPI] Reply enabled (media URL): replyid=${replyId}`);
          }
          
          // Add text for non-audio messages
          if (typeof content === 'string' && content && messageType !== 'audio') {
            urlBody.text = content;
          }
          
          // Add docName for documents
          if (messageType === 'document') {
            urlBody.docName = typeof content === 'string' && content ? content : 'document';
          }
          
          try {
            const urlResult = await tryPostWithRetry(endpoint, urlBody, 1);
            apiResponse = urlResult.res;
            apiResult = urlResult.json;
            
            if (apiResponse && apiResponse.ok) {
              console.log(`[UAZAPI] ${messageType} sent successfully via URL`);
              sendSuccess = true;
            } else if (apiResponse) {
              const errMsg = apiResult?.error || apiResult?.message || 'Unknown error';
              console.log(`[UAZAPI] URL method failed with ${apiResponse.status}: ${errMsg}, falling back to base64...`);
            }
          } catch (urlErr) {
            console.warn(`[UAZAPI] URL method threw error, falling back to base64:`, urlErr);
          }
        }
        
        // If URL didn't work (or wasn't tried), use base64 with retry
        if (!sendSuccess) {
          console.log(`[UAZAPI] Sending ${messageType} via base64...`);
          
          body = {
            number: String(sendDestination),
            type: uazType,
            file: urlToSend,
            ...(typeof content === 'string' && content && messageType !== 'audio' ? { text: content } : {}),
            ...(uazType === 'document'
              ? { docName: typeof content === 'string' && content ? content : 'document' }
              : {}),
          };

          // Reply support for media
          if (replyId) {
            (body as any).replyid = replyId;
            (body as any).quoted = replyId;
            console.log(`[UAZAPI] Reply enabled (media base64): replyid=${replyId}`);
          }

          const retryResult = await tryPostWithRetry(endpoint, body, 2);
          apiResponse = retryResult.res;
          apiResult = retryResult.json;
        }

        console.log(`[UAZAPI] ${endpoint} -> ${apiResponse!.status}`);
        console.log('API response:', JSON.stringify(apiResult, null, 2));

        if (!apiResponse!.ok) {
          console.error('API error:', apiResult);

          if (messageId) {
            await supabaseAdmin
              .from('inbox_messages')
              .update({ status: 'failed' })
              .eq('id', messageId);
          }

          const errorMessage = apiResult?.error || apiResult?.message || apiResult?.response?.message;
          const errorDetails = Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage;

          let userFriendlyError = 'Falha ao enviar mensagem';
          let errorCode = 'SEND_FAILED';

          // Check for timeout specifically
          if (apiResponse!.status === 408 || (typeof errorDetails === 'string' && errorDetails.includes('timeout'))) {
            userFriendlyError = 'Tempo limite excedido ao enviar arquivo. Tente um arquivo menor.';
            errorCode = 'UPLOAD_TIMEOUT';
          } else if (typeof errorDetails === 'string' && (errorDetails.includes('disconnected') || errorDetails.includes('logged out'))) {
            userFriendlyError = 'A instância do WhatsApp está desconectada. Reconecte e tente novamente.';
            errorCode = 'INSTANCE_DISCONNECTED';
          }

          if (instanceId && errorCode === 'INSTANCE_DISCONNECTED') {
            const { error: statusErr } = await supabaseAdmin
              .from('maturador_instances')
              .update({ status: 'disconnected', last_error_at: new Date().toISOString() })
              .eq('id', instanceId);
            if (statusErr) console.warn('Failed to mark instance as disconnected:', statusErr);
          }

          return new Response(JSON.stringify({
            error: userFriendlyError,
            errorCode,
            details: apiResult,
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        var finalApiResult = apiResult;
      }
    } else {
      // Evolution API endpoints - use apikey header
      authHeader = { apikey: API_KEY };

      switch (messageType) {
        case 'text':
          apiEndpoint = `/message/sendText/${instanceName}`;
          apiBody = { number: sendDestination, text: content };
          break;
        case 'image':
          apiEndpoint = `/message/sendMedia/${instanceName}`;
          apiBody = { number: sendDestination, mediatype: 'image', media: urlToSend, caption: content || '' };
          break;
        case 'audio':
          apiEndpoint = `/message/sendWhatsAppAudio/${instanceName}`;
          apiBody = { number: sendDestination, audio: urlToSend };
          break;
        case 'video':
          apiEndpoint = `/message/sendMedia/${instanceName}`;
          apiBody = { number: sendDestination, mediatype: 'video', media: urlToSend, caption: content || '' };
          break;
        case 'document':
          apiEndpoint = `/message/sendMedia/${instanceName}`;
          apiBody = { number: sendDestination, mediatype: 'document', media: urlToSend, fileName: content || 'document' };
          break;
        default:
          apiEndpoint = `/message/sendText/${instanceName}`;
          apiBody = { number: sendDestination, text: content };
      }

      const apiResponse = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
        method: 'POST',
        headers: {
          ...authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiBody),
      });

      const apiResult = await apiResponse.json();
      console.log('API response:', JSON.stringify(apiResult, null, 2));

      if (!apiResponse.ok) {
        console.error('API error:', apiResult);

        // Update message status to failed if we have messageId
        if (messageId) {
          await supabaseAdmin
            .from('inbox_messages')
            .update({ status: 'failed' })
            .eq('id', messageId);
        }

        // Parse specific error messages for better user feedback
        const errorMessage = apiResult?.message || apiResult?.response?.message;
        const errorDetails = Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage;

        let userFriendlyError = 'Falha ao enviar mensagem';
        let errorCode = 'SEND_FAILED';

        if (errorDetails?.includes('Connection Closed') || errorDetails?.includes('connection closed')) {
          userFriendlyError = 'Conexão fechada. O número pode não ter WhatsApp ou a instância perdeu conexão.';
          errorCode = 'CONNECTION_CLOSED';
        } else if (errorDetails?.includes('not registered') || errorDetails?.includes('not on whatsapp')) {
          userFriendlyError = 'Este número não possui WhatsApp';
          errorCode = 'NUMBER_NOT_ON_WHATSAPP';
        } else if (errorDetails?.includes('disconnected') || errorDetails?.includes('logged out')) {
          userFriendlyError = 'A instância do WhatsApp está desconectada. Reconecte e tente novamente.';
          errorCode = 'INSTANCE_DISCONNECTED';
        }

        // Persist disconnected status AND last_error_at so UI can warn even without sending
        if (instanceId && (errorCode === 'CONNECTION_CLOSED' || errorCode === 'INSTANCE_DISCONNECTED')) {
          const { error: statusErr } = await supabaseAdmin
            .from('maturador_instances')
            .update({
              status: 'disconnected',
              last_error_at: new Date().toISOString(),
            })
            .eq('id', instanceId);

          if (statusErr) console.warn('Failed to mark instance as disconnected:', statusErr);
        }

        return new Response(JSON.stringify({
          error: userFriendlyError,
          errorCode,
          details: apiResult,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      var finalApiResult = apiResult;
    }

    // From here on, use finalApiResult for success flow
    const apiResult = finalApiResult;

    // Extract message ID from response
    const remoteMessageId = apiResult.key?.id || apiResult.messageId || apiResult.id || null;

    // Mark instance connected AND clear last_error_at (best-effort)
    if (instanceId) {
      const { error: statusErr } = await supabaseAdmin
        .from('maturador_instances')
        .update({ 
          status: 'connected',
          last_error_at: null
        })
        .eq('id', instanceId);

      if (statusErr) console.warn('Failed to mark instance as connected:', statusErr);
    }

    // Update message status to 'sent' and save remote_message_id
    if (messageId) {
      const updateData: Record<string, unknown> = { status: 'sent' };
      if (remoteMessageId) {
        updateData.remote_message_id = remoteMessageId;
      }
      
      const { error: updateError } = await supabaseAdmin
        .from('inbox_messages')
        .update(updateData)
        .eq('id', messageId);
        
      if (updateError) {
        console.error('Error updating message status:', updateError);
      } else {
        console.log(`Message ${messageId} status updated to 'sent', remote_message_id: ${remoteMessageId}`);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: remoteMessageId,
      result: apiResult 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('Send message error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});