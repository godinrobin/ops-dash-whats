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

    // Get instance info and user's Evolution API config
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

    // Get user's Evolution API config
    const { data: config } = await supabaseClient
      .from('maturador_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const EVOLUTION_BASE_URL = config.evolution_base_url;
    const EVOLUTION_API_KEY = config.evolution_api_key;

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

      // Get contact name and profile picture from Evolution API
      let contactName = chat.name || chat.pushName || null;
      let profilePicUrl = chat.profilePictureUrl || null;

      // Try to fetch profile picture if not available
      if (!profilePicUrl) {
        try {
          const profileResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/fetchProfilePictureUrl/${instance.instance_name}`, {
            method: 'POST',
            headers: {
              'apikey': EVOLUTION_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ number: phone }),
          });

          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            profilePicUrl = profileData.profilePictureUrl || profileData.picture || profileData.url || null;
          }
        } catch (e) {
          console.log('Could not fetch profile picture for', phone);
        }
      }

      // Try to fetch contact name if not available
      if (!contactName) {
        try {
          const contactResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/findContacts/${instance.instance_name}`, {
            method: 'POST',
            headers: {
              'apikey': EVOLUTION_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              where: { id: remoteJid }
            }),
          });

          if (contactResponse.ok) {
            const contactData = await contactResponse.json();
            if (contactData && contactData.length > 0) {
              contactName = contactData[0].pushName || contactData[0].name || contactData[0].notify || null;
              if (!profilePicUrl) {
                profilePicUrl = contactData[0].profilePictureUrl || null;
              }
            }
          }
        } catch (e) {
          console.log('Could not fetch contact info for', phone);
        }
      }

      // Check if contact already exists
      const { data: existingContact } = await supabaseClient
        .from('inbox_contacts')
        .select('id')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .single();

      if (existingContact) {
        // Update existing contact with name and profile pic if we have new data
        if (contactName || profilePicUrl) {
          await supabaseClient
            .from('inbox_contacts')
            .update({
              ...(contactName && { name: contactName }),
              ...(profilePicUrl && { profile_pic_url: profilePicUrl }),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingContact.id);
        }
        updated++;
        continue;
      }

      // Create new contact
      const { data: newContact, error: insertError } = await supabaseClient
        .from('inbox_contacts')
        .insert({
          user_id: user.id,
          instance_id: instanceId,
          phone,
          name: contactName,
          profile_pic_url: profilePicUrl,
          status: 'active',
          unread_count: chat.unreadCount || 0,
          last_message_at: chat.lastMsgTimestamp 
            ? new Date(chat.lastMsgTimestamp * 1000).toISOString() 
            : new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting contact:', insertError);
        continue;
      }

      imported++;

      // Fetch messages for this chat
      if (newContact) {
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
              limit: 100,
            }),
          });

          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            const messages = messagesData.messages || messagesData || [];

            if (messages.length > 0) {
              for (const msg of messages.slice(0, 100)) {
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
                  mediaUrl = msg.message.imageMessage.url || null;
                } else if (msg.message?.audioMessage) {
                  messageType = 'audio';
                  mediaUrl = msg.message.audioMessage.url || null;
                } else if (msg.message?.videoMessage) {
                  messageType = 'video';
                  content = msg.message.videoMessage.caption || '';
                  mediaUrl = msg.message.videoMessage.url || null;
                } else if (msg.message?.documentMessage) {
                  messageType = 'document';
                  content = msg.message.documentMessage.fileName || '';
                  mediaUrl = msg.message.documentMessage.url || null;
                }

                // Skip empty messages
                if (!content && !mediaUrl) continue;

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
