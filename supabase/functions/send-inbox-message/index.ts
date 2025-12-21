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

    const { contactId, instanceName, phone, content, messageType = 'text', mediaUrl, messageId } = await req.json();
    
    console.log('Sending message:', { contactId, instanceName, phone, messageType, content: content?.substring(0, 50), messageId });

    if (!instanceName || !phone) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's Evolution API config
    const { data: config } = await supabaseClient
      .from('maturador_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const EVOLUTION_BASE_URL = config?.evolution_base_url?.replace(/\/$/, '') || 'https://api.chatwp.xyz';
    const EVOLUTION_API_KEY = config?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '';

    // Format phone number for Evolution API
    const formattedPhone = phone.replace(/\D/g, '');

    let evolutionEndpoint = '';
    let evolutionBody: Record<string, unknown> = {};

    switch (messageType) {
      case 'text':
        evolutionEndpoint = `/message/sendText/${instanceName}`;
        evolutionBody = {
          number: formattedPhone,
          text: content,
        };
        break;

      case 'image':
        evolutionEndpoint = `/message/sendMedia/${instanceName}`;
        evolutionBody = {
          number: formattedPhone,
          mediatype: 'image',
          media: mediaUrl,
          caption: content || '',
        };
        break;

      case 'audio':
        evolutionEndpoint = `/message/sendWhatsAppAudio/${instanceName}`;
        evolutionBody = {
          number: formattedPhone,
          audio: mediaUrl,
        };
        break;

      case 'video':
        evolutionEndpoint = `/message/sendMedia/${instanceName}`;
        evolutionBody = {
          number: formattedPhone,
          mediatype: 'video',
          media: mediaUrl,
          caption: content || '',
        };
        break;

      case 'document':
        evolutionEndpoint = `/message/sendMedia/${instanceName}`;
        evolutionBody = {
          number: formattedPhone,
          mediatype: 'document',
          media: mediaUrl,
          fileName: content || 'document',
        };
        break;

      default:
        evolutionEndpoint = `/message/sendText/${instanceName}`;
        evolutionBody = {
          number: formattedPhone,
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
      
      return new Response(JSON.stringify({ 
        error: evolutionResult.message || 'Failed to send message',
        details: evolutionResult 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract message ID from response
    const remoteMessageId = evolutionResult.key?.id || evolutionResult.messageId || evolutionResult.id || null;

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
