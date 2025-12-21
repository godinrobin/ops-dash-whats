import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_BASE_URL = 'https://api.chatwp.xyz';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

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

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { instanceId } = await req.json();
    console.log('Syncing contacts for instance:', instanceId);

    // Get instance info
    const { data: instance, error: instanceError } = await supabaseClient
      .from('maturador_instances')
      .select('*')
      .eq('id', instanceId)
      .eq('user_id', user.id)
      .single();

    if (instanceError || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch chats from Evolution API
    const chatsResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/findChats/${instance.instance_name}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!chatsResponse.ok) {
      const errorText = await chatsResponse.text();
      console.error('Evolution API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch chats from Evolution API' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chats = await chatsResponse.json();
    console.log(`Found ${chats?.length || 0} chats`);

    let imported = 0;
    let updated = 0;

    for (const chat of chats || []) {
      // Only process individual chats (not groups)
      const remoteJid = chat.id || chat.remoteJid;
      if (!remoteJid || remoteJid.includes('@g.us')) continue;

      const phone = remoteJid.split('@')[0];
      if (!phone) continue;

      // Check if contact already exists
      const { data: existingContact } = await supabaseClient
        .from('inbox_contacts')
        .select('id')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .single();

      if (existingContact) {
        updated++;
        continue;
      }

      // Create new contact
      const { error: insertError } = await supabaseClient
        .from('inbox_contacts')
        .insert({
          user_id: user.id,
          instance_id: instanceId,
          phone,
          name: chat.name || chat.pushName || null,
          profile_pic_url: chat.profilePictureUrl || null,
          status: 'active',
          unread_count: chat.unreadCount || 0,
          last_message_at: chat.lastMsgTimestamp 
            ? new Date(chat.lastMsgTimestamp * 1000).toISOString() 
            : new Date().toISOString(),
        });

      if (insertError) {
        console.error('Error inserting contact:', insertError);
        continue;
      }

      imported++;

      // Optionally fetch messages for this chat
      // This can be slow for many contacts, so we limit it
      if (imported <= 10) {
        try {
          const messagesResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/findMessages/${instance.instance_name}`, {
            method: 'POST',
            headers: {
              'apikey': EVOLUTION_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              where: {
                key: {
                  remoteJid,
                },
              },
              limit: 50,
            }),
          });

          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            const messages = messagesData.messages || messagesData || [];

            // Get the newly created contact
            const { data: newContact } = await supabaseClient
              .from('inbox_contacts')
              .select('id')
              .eq('user_id', user.id)
              .eq('phone', phone)
              .single();

            if (newContact && messages.length > 0) {
              for (const msg of messages.slice(0, 50)) {
                const key = msg.key || {};
                const direction = key.fromMe ? 'outbound' : 'inbound';
                
                let content = '';
                let messageType = 'text';
                let mediaUrl = null;

                if (msg.message?.conversation) {
                  content = msg.message.conversation;
                } else if (msg.message?.extendedTextMessage?.text) {
                  content = msg.message.extendedTextMessage.text;
                } else if (msg.message?.imageMessage) {
                  messageType = 'image';
                  content = msg.message.imageMessage.caption || '';
                } else if (msg.message?.audioMessage) {
                  messageType = 'audio';
                } else if (msg.message?.videoMessage) {
                  messageType = 'video';
                  content = msg.message.videoMessage.caption || '';
                }

                await supabaseClient
                  .from('inbox_messages')
                  .insert({
                    contact_id: newContact.id,
                    instance_id: instanceId,
                    user_id: user.id,
                    direction,
                    message_type: messageType,
                    content,
                    media_url: mediaUrl,
                    remote_message_id: key.id,
                    status: 'delivered',
                    is_from_flow: false,
                    created_at: msg.messageTimestamp 
                      ? new Date(msg.messageTimestamp * 1000).toISOString()
                      : new Date().toISOString(),
                  });
              }
            }
          }
        } catch (msgError) {
          console.error('Error fetching messages:', msgError);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      imported,
      updated,
      total: chats?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('Sync contacts error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
