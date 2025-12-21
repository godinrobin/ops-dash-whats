import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validate if string is a valid phone number (10-15 digits)
const isValidPhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return /^\d{10,15}$/.test(cleaned);
};

// Extract clean phone number from remoteJid
const extractPhoneFromJid = (jid: string): string | null => {
  if (!jid) return null;
  
  // Remove @s.whatsapp.net or @c.us suffix
  const phone = jid.split('@')[0];
  
  // Clean non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Validate it's a real phone number
  if (!isValidPhoneNumber(cleaned)) {
    return null;
  }
  
  return cleaned;
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
      console.error('Instance not found:', instanceError);
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

    const EVOLUTION_BASE_URL = config.evolution_base_url.replace(/\/$/, '');
    const EVOLUTION_API_KEY = config.evolution_api_key;
    const instanceName = instance.instance_name;

    console.log(`Fetching chats from ${EVOLUTION_BASE_URL} for instance ${instanceName}`);

    // Fetch chats from Evolution API
    const chatsResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/findChats/${instanceName}`, {
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
      return new Response(JSON.stringify({ error: 'Failed to fetch chats from Evolution API', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chats = await chatsResponse.json();
    console.log(`Found ${chats?.length || 0} chats from Evolution API`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const chat of chats || []) {
      const remoteJid = chat.id || chat.remoteJid;
      
      // Skip group chats
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {
        skipped++;
        continue;
      }

      // Extract and validate phone number
      const phone = extractPhoneFromJid(remoteJid);
      if (!phone) {
        console.log(`Skipping invalid phone from jid: ${remoteJid}`);
        skipped++;
        continue;
      }

      // Get contact name from chat's pushName/notify - these are the real names
      let contactName = chat.pushName || chat.notify || null;
      let profilePicUrl = chat.profilePictureUrl || chat.imgUrl || null;

      // If no name in chat, try to get from recent messages
      if (!contactName) {
        try {
          const messagesResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/findMessages/${instanceName}`, {
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
              limit: 10,
            }),
          });

          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            const messages = messagesData.messages || messagesData || [];
            
            // Find pushName from incoming messages (not fromMe)
            for (const msg of messages) {
              if (!msg.key?.fromMe && msg.pushName) {
                contactName = msg.pushName;
                console.log(`Found pushName from message for ${phone}: ${contactName}`);
                break;
              }
            }
          }
        } catch (e) {
          console.log(`Could not fetch messages to get pushName for ${phone}:`, e);
        }
      }

      console.log(`Processing contact: ${phone}, name: ${contactName || 'unknown'}, pic: ${profilePicUrl ? 'yes' : 'no'}`);

      // Try to fetch profile picture if not available
      if (!profilePicUrl) {
        try {
          const profileResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/fetchProfilePictureUrl/${instanceName}`, {
            method: 'POST',
            headers: {
              'apikey': EVOLUTION_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ number: phone }),
          });

          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            profilePicUrl = profileData.profilePictureUrl || profileData.picture || profileData.url || profileData.imgUrl || null;
            console.log(`Fetched profile pic for ${phone}: ${profilePicUrl ? 'success' : 'not found'}`);
          }
        } catch (e) {
          console.log(`Could not fetch profile picture for ${phone}:`, e);
        }
      }

      // Check if contact already exists for this user and instance
      const { data: existingContact } = await supabaseClient
        .from('inbox_contacts')
        .select('id, name, profile_pic_url')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .eq('instance_id', instanceId)
        .single();

      if (existingContact) {
        // Update existing contact with new name and profile pic if available
        const updates: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };

        // Update name if we have a new one from pushName and it's different from stored
        if (contactName && contactName !== existingContact.name) {
          updates.name = contactName;
        }
        
        // Update profile pic if we have a new one
        if (profilePicUrl && profilePicUrl !== existingContact.profile_pic_url) {
          updates.profile_pic_url = profilePicUrl;
        }

        if (Object.keys(updates).length > 1) {
          await supabaseClient
            .from('inbox_contacts')
            .update(updates)
            .eq('id', existingContact.id);
          console.log(`Updated contact ${phone} with new data: name=${updates.name || 'unchanged'}, pic=${updates.profile_pic_url ? 'updated' : 'unchanged'}`);
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
        console.error(`Error inserting contact ${phone}:`, insertError);
        continue;
      }

      console.log(`Created new contact: ${phone} (${contactName || 'no name'})`);
      imported++;

      // Fetch messages for this chat and extract pushName from them
      if (newContact) {
        try {
          const messagesResponse = await fetch(`${EVOLUTION_BASE_URL}/chat/findMessages/${instanceName}`, {
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
            console.log(`Fetched ${messages.length} messages for ${phone}`);

            let messagesImported = 0;
            let foundPushName = null;
            
            for (const msg of messages.slice(0, 100)) {
              const key = msg.key || {};
              const direction = key.fromMe ? 'outbound' : 'inbound';
              
              // Extract pushName from incoming messages
              if (!key.fromMe && msg.pushName && !foundPushName) {
                foundPushName = msg.pushName;
              }
              
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

              const { error: msgError } = await supabaseClient
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

              if (!msgError) {
                messagesImported++;
              }
            }
            
            // Update contact with pushName found in messages
            if (foundPushName && !contactName) {
              await supabaseClient
                .from('inbox_contacts')
                .update({ name: foundPushName })
                .eq('id', newContact.id);
              console.log(`Updated contact ${phone} with pushName from messages: ${foundPushName}`);
            }
            
            console.log(`Imported ${messagesImported} messages for ${phone}`);
          }
        } catch (msgError) {
          console.error(`Error fetching messages for ${phone}:`, msgError);
        }
      }
    }

    console.log(`Sync complete: ${imported} imported, ${updated} updated, ${skipped} skipped`);

    return new Response(JSON.stringify({ 
      success: true, 
      imported,
      updated,
      skipped,
      total: chats?.length || 0,
      instanceName
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
