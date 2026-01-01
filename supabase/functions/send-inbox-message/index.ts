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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Also create a service role client for updating messages
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { contactId, instanceName, phone, content, messageType = 'text', mediaUrl, messageId, remoteJid } = await req.json();
    
    console.log('Sending message:', { contactId, instanceName, phone, remoteJid, messageType, content: content?.substring(0, 50), messageId });

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


    // For @lid contacts, skip the WhatsApp number check (we can't verify LID contacts)
    // For regular phone contacts, verify if the number exists on WhatsApp (Evolution only)
    if (!isLidContact && apiProvider === 'evolution') {
      console.log('Checking if number exists on WhatsApp...');
      try {
        const checkResponse = await fetch(`${API_BASE_URL}/chat/whatsappNumbers/${instanceName}`, {
          method: 'POST',
          headers: {
            'apikey': API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ numbers: [sendDestination] }),
        });

        const checkResult = await checkResponse.json();
        console.log('WhatsApp number check result:', JSON.stringify(checkResult, null, 2));

        // Check if the number exists on WhatsApp
        const numberInfo = checkResult?.[0] || checkResult;
        const exists = numberInfo?.exists === true || numberInfo?.numberExists === true;
        
        if (!exists && checkResponse.ok) {
          console.log('Number does not exist on WhatsApp');
          
          // Update message status to failed if we have messageId
          if (messageId) {
            await supabaseAdmin
              .from('inbox_messages')
              .update({ status: 'failed' })
              .eq('id', messageId);
          }
          
          return new Response(JSON.stringify({ 
            error: 'Este número não possui WhatsApp',
            errorCode: 'NUMBER_NOT_ON_WHATSAPP',
            details: checkResult 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (checkErr) {
        // If the check fails, log and continue - the send might still work
        console.warn('WhatsApp number check failed, continuing with send:', checkErr);
      }
    } else if (isLidContact) {
      console.log('[LID] Skipping WhatsApp number check for @lid contact');
    }

    // Use the persisted URL for sending
    const urlToSend = persistedMediaUrl || mediaUrl;

    let apiEndpoint = '';
    let apiBody: Record<string, unknown> = {};
    let authHeader: Record<string, string> = {};

    const tryPostJson = async (endpoint: string, body: Record<string, unknown>) => {
      console.log(`[${apiProvider.toUpperCase()}] Calling API: POST ${API_BASE_URL}${endpoint}`);
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          ...authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        const text = await res.text().catch(() => '');
        json = { message: text };
      }
      return { res, json };
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

      if (messageType === 'text') {
        endpoint = '/send/text';
        body = {
          number: String(sendDestination),
          text: typeof content === 'string' ? content : String(content ?? ''),
        };
      } else {
        endpoint = '/send/media';

        // UazAPI uses 'ptt' (push-to-talk) for audio/voice messages
        const uazType =
          messageType === 'image' ? 'image'
          : messageType === 'video' ? 'video'
          : messageType === 'audio' ? 'ptt'
          : messageType === 'document' ? 'document'
          : 'document';

        body = {
          number: String(sendDestination),
          type: uazType,
          file: urlToSend,
          ...(typeof content === 'string' && content && messageType !== 'audio' ? { text: content } : {}),
          ...(uazType === 'document'
            ? { docName: typeof content === 'string' && content ? content : 'document' }
            : {}),
        };
      }

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