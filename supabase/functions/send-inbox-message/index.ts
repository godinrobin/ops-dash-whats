import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Resolve instance id and get Evolution config for status updates
    const { data: instanceRow } = await supabaseAdmin
      .from('maturador_instances')
      .select('id, evolution_base_url, evolution_api_key')
      .eq('instance_name', instanceName)
      .eq('user_id', user.id)
      .maybeSingle();

    const instanceId = instanceRow?.id ?? null;

    // PRIORITY: 1) Instance config, 2) User config, 3) Admin config, 4) Global secrets
    let EVOLUTION_BASE_URL = '';
    let EVOLUTION_API_KEY = '';
    let configSource = 'none';

    // 1) Try instance's own config (highest priority)
    if (instanceRow?.evolution_base_url && instanceRow?.evolution_api_key) {
      EVOLUTION_BASE_URL = instanceRow.evolution_base_url.replace(/\/$/, '');
      EVOLUTION_API_KEY = instanceRow.evolution_api_key;
      configSource = 'instance';
      console.log(`[SEND-MESSAGE] Using instance config: ${EVOLUTION_BASE_URL}`);
    }
    
    // 2) Try user's own config
    if (!EVOLUTION_BASE_URL) {
      const { data: userConfig } = await supabaseAdmin
        .from('maturador_config')
        .select('evolution_base_url, evolution_api_key')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (userConfig?.evolution_base_url && userConfig?.evolution_api_key) {
        EVOLUTION_BASE_URL = userConfig.evolution_base_url.replace(/\/$/, '');
        EVOLUTION_API_KEY = userConfig.evolution_api_key;
        configSource = 'user';
        console.log(`[SEND-MESSAGE] Using user config: ${EVOLUTION_BASE_URL}`);
      }
    }

    // 3) Try any admin config (first available)
    if (!EVOLUTION_BASE_URL) {
      const { data: adminConfig } = await supabaseAdmin
        .from('maturador_config')
        .select('evolution_base_url, evolution_api_key')
        .limit(1)
        .maybeSingle();
      
      if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
        EVOLUTION_BASE_URL = adminConfig.evolution_base_url.replace(/\/$/, '');
        EVOLUTION_API_KEY = adminConfig.evolution_api_key;
        configSource = 'admin';
        console.log(`[SEND-MESSAGE] Using admin config: ${EVOLUTION_BASE_URL}`);
      }
    }

    // 4) Try global secrets
    if (!EVOLUTION_BASE_URL) {
      const globalBaseUrl = Deno.env.get('EVOLUTION_BASE_URL');
      const globalApiKey = Deno.env.get('EVOLUTION_API_KEY');
      
      if (globalBaseUrl && globalApiKey) {
        EVOLUTION_BASE_URL = globalBaseUrl.replace(/\/$/, '');
        EVOLUTION_API_KEY = globalApiKey;
        configSource = 'global';
        console.log(`[SEND-MESSAGE] Using global config: ${EVOLUTION_BASE_URL}`);
      }
    }

    if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) {
      console.error('[SEND-MESSAGE] No Evolution API configuration available');
      return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    let evolutionEndpoint = '';
    let evolutionBody: Record<string, unknown> = {};

    // For @lid contacts, skip the WhatsApp number check (we can't verify LID contacts)
    // For regular phone contacts, verify if the number exists on WhatsApp
    if (!isLidContact) {
      console.log('Checking if number exists on WhatsApp...');
      try {
        const checkResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/whatsappNumbers/${instanceName}`, {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
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
    } else {
      console.log('[LID] Skipping WhatsApp number check for @lid contact');
    }

    switch (messageType) {
      case 'text':
        evolutionEndpoint = `/message/sendText/${instanceName}`;
        evolutionBody = {
          number: sendDestination,
          text: content,
        };
        break;

      case 'image':
        evolutionEndpoint = `/message/sendMedia/${instanceName}`;
        evolutionBody = {
          number: sendDestination,
          mediatype: 'image',
          media: mediaUrl,
          caption: content || '',
        };
        break;

      case 'audio':
        evolutionEndpoint = `/message/sendWhatsAppAudio/${instanceName}`;
        evolutionBody = {
          number: sendDestination,
          audio: mediaUrl,
        };
        break;

      case 'video':
        evolutionEndpoint = `/message/sendMedia/${instanceName}`;
        evolutionBody = {
          number: sendDestination,
          mediatype: 'video',
          media: mediaUrl,
          caption: content || '',
        };
        break;

      case 'document':
        evolutionEndpoint = `/message/sendMedia/${instanceName}`;
        evolutionBody = {
          number: sendDestination,
          mediatype: 'document',
          media: mediaUrl,
          fileName: content || 'document',
        };
        break;

      default:
        evolutionEndpoint = `/message/sendText/${instanceName}`;
        evolutionBody = {
          number: sendDestination,
          text: content,
        };
    }

    console.log(`Calling Evolution API: POST ${EVOLUTION_BASE_URL}${evolutionEndpoint}`);

    const evolutionResponse = await fetch(`${EVOLUTION_BASE_URL}${evolutionEndpoint}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(evolutionBody),
    });

    const evolutionResult = await evolutionResponse.json();
    console.log('Evolution API response:', JSON.stringify(evolutionResult, null, 2));

    if (!evolutionResponse.ok) {
      console.error('Evolution API error:', evolutionResult);
      
      // Update message status to failed if we have messageId
      if (messageId) {
        await supabaseAdmin
          .from('inbox_messages')
          .update({ status: 'failed' })
          .eq('id', messageId);
      }
      
      // Parse specific error messages for better user feedback
      const errorMessage = evolutionResult?.message || evolutionResult?.response?.message;
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
            last_error_at: new Date().toISOString()
          })
          .eq('id', instanceId);

        if (statusErr) console.warn('Failed to mark instance as disconnected:', statusErr);
      }
      
      return new Response(JSON.stringify({ 
        error: userFriendlyError,
        errorCode,
        details: evolutionResult 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract message ID from response
    const remoteMessageId = evolutionResult.key?.id || evolutionResult.messageId || evolutionResult.id || null;

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
      result: evolutionResult 
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
