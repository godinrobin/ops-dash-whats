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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !data?.claims) {
      console.error('[MARK-READ] Invalid token:', claimsError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const user = { id: data.claims.sub as string };

    const { contactId } = await req.json();
    
    if (!contactId) {
      return new Response(JSON.stringify({ error: 'Contact ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[MARK-READ] Processing contact: ${contactId}`);

    // Fetch contact with instance info
    const { data: contact, error: contactError } = await supabaseClient
      .from('inbox_contacts')
      .select('id, phone, remote_jid, instance_id, user_id')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single();

    if (contactError || !contact) {
      console.error('[MARK-READ] Contact not found:', contactError);
      return new Response(JSON.stringify({ error: 'Contact not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!contact.instance_id) {
      console.log('[MARK-READ] No instance associated with contact');
      return new Response(JSON.stringify({ success: true, message: 'No instance to mark read' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch instance info
    const { data: instance, error: instanceError } = await supabaseClient
      .from('maturador_instances')
      .select('id, instance_name, api_provider, uazapi_token, status')
      .eq('id', contact.instance_id)
      .single();

    if (instanceError || !instance) {
      console.error('[MARK-READ] Instance not found:', instanceError);
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (instance.status !== 'connected' && instance.status !== 'open') {
      console.log('[MARK-READ] Instance not connected:', instance.status);
      return new Response(JSON.stringify({ success: true, message: 'Instance not connected' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get remoteJid for the contact
    const remoteJid = contact.remote_jid || `${contact.phone}@s.whatsapp.net`;
    console.log(`[MARK-READ] Remote JID: ${remoteJid}`);

    // Fetch recent inbound messages with remote_message_id
    // Look for messages that are NOT 'read' (could be 'received', 'delivered', 'sent', etc.)
    const { data: messages, error: messagesError } = await supabaseClient
      .from('inbox_messages')
      .select('id, remote_message_id, status')
      .eq('contact_id', contactId)
      .eq('direction', 'inbound')
      .not('remote_message_id', 'is', null)
      .neq('status', 'read') // Only get messages that are NOT read
      .order('created_at', { ascending: false })
      .limit(50);

    if (messagesError) {
      console.error('[MARK-READ] Error fetching messages:', messagesError);
    }

    const unreadMessages = (messages || []).filter(m => m.remote_message_id);
    console.log(`[MARK-READ] Found ${unreadMessages.length} unread inbound messages`);

    // Handle based on API provider
    if (instance.api_provider === 'uazapi') {
      // Get UAZAPI base URL
      const { data: apiConfig } = await supabaseClient
        .from('whatsapp_api_config')
        .select('uazapi_base_url')
        .limit(1)
        .single();

      if (!apiConfig?.uazapi_base_url || !instance.uazapi_token) {
        console.error('[MARK-READ] UAZAPI config missing');
        return new Response(JSON.stringify({ error: 'UAZAPI config missing' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const baseUrl = apiConfig.uazapi_base_url.replace(/\/$/, '');
      
      // UAZAPI: Use POST /chat/read to mark the ENTIRE CHAT as read
      // This is more reliable than marking individual messages
      // API: { number: "5511999999999@s.whatsapp.net", read: true }
      console.log(`[MARK-READ] Calling UAZAPI POST /chat/read for: ${remoteJid}`);
      
      const response = await fetch(`${baseUrl}/chat/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': instance.uazapi_token,
        },
        body: JSON.stringify({ 
          number: remoteJid,
          read: true 
        }),
      });

      let result: any;
      try {
        result = await response.json();
      } catch {
        result = await response.text();
      }
      console.log(`[MARK-READ] UAZAPI /chat/read response: ${response.status}`, JSON.stringify(result));

      if (!response.ok) {
        console.error('[MARK-READ] UAZAPI /chat/read error:', result);
      }
      
      // Update local message statuses to 'read'
      for (const msg of unreadMessages) {
        await supabaseClient
          .from('inbox_messages')
          .update({ status: 'read' })
          .eq('id', msg.id);
      }
    } else {
      // Evolution API: PUT /chat/markMessageAsRead/{instanceName}
      // Get Evolution config
      let baseUrl = '';
      let apiKey = '';

      // Try instance config first
      const { data: instanceConfig } = await supabaseClient
        .from('maturador_instances')
        .select('evolution_base_url, evolution_api_key')
        .eq('id', instance.id)
        .single();

      if (instanceConfig?.evolution_base_url && instanceConfig?.evolution_api_key) {
        baseUrl = instanceConfig.evolution_base_url.replace(/\/$/, '');
        apiKey = instanceConfig.evolution_api_key;
      }

      // Fallback to user config
      if (!baseUrl) {
        const { data: userConfig } = await supabaseClient
          .from('maturador_config')
          .select('evolution_base_url, evolution_api_key')
          .eq('user_id', user.id)
          .maybeSingle();

        if (userConfig?.evolution_base_url && userConfig?.evolution_api_key) {
          baseUrl = userConfig.evolution_base_url.replace(/\/$/, '');
          apiKey = userConfig.evolution_api_key;
        }
      }

      // Fallback to admin config
      if (!baseUrl) {
        const { data: adminConfig } = await supabaseClient
          .from('maturador_config')
          .select('evolution_base_url, evolution_api_key')
          .limit(1)
          .maybeSingle();

        if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
          baseUrl = adminConfig.evolution_base_url.replace(/\/$/, '');
          apiKey = adminConfig.evolution_api_key;
        }
      }

      if (baseUrl && apiKey && unreadMessages.length > 0) {
        // Extract message IDs for Evolution API
        const messageIds = unreadMessages
          .map(m => {
            const id = String(m.remote_message_id || '');
            if (id.includes(':')) {
              const parts = id.split(':').filter(Boolean);
              return parts[parts.length - 1];
            }
            return id;
          })
          .filter(id => id && id.length > 5);

        console.log(`[MARK-READ] Calling Evolution /chat/markMessageAsRead/${instance.instance_name} with ${messageIds.length} IDs`);
        
        const response = await fetch(`${baseUrl}/chat/markMessageAsRead/${instance.instance_name}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
          },
          body: JSON.stringify({
            readMessages: messageIds.map(id => ({
              remoteJid,
              id,
            })),
          }),
        });

        const result = await response.text();
        console.log(`[MARK-READ] Evolution response: ${response.status}`, result);

        if (response.ok) {
          // Update local message statuses
          for (const msg of unreadMessages) {
            await supabaseClient
              .from('inbox_messages')
              .update({ status: 'read' })
              .eq('id', msg.id);
          }
        }
      } else {
        console.log('[MARK-READ] No Evolution config found or no unread messages');
      }
    }

    // Update contact unread_count
    await supabaseClient
      .from('inbox_contacts')
      .update({ unread_count: 0 })
      .eq('id', contactId);

    console.log(`[MARK-READ] Successfully processed contact ${contactId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      markedCount: unreadMessages.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[MARK-READ] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
