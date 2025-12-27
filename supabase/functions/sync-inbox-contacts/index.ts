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

// Robust message parser - matches sync-inbox-messages logic
type EvolutionMessage = {
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
  };
  pushName?: string;
  messageTimestamp?: number | string;
  message?: any;
  messageType?: string; // Some responses have this at root level
};

const parseEvolutionContent = (msg: EvolutionMessage): { content: string | null; messageType: string; mediaUrl: string | null } => {
  const m = msg.message || {};

  // Handle messageType at root level (some Evolution API versions)
  if (msg.messageType && !msg.message) {
    return { messageType: msg.messageType, content: null, mediaUrl: null };
  }

  if (m?.conversation) {
    return { messageType: "text", content: m.conversation, mediaUrl: null };
  }
  if (m?.extendedTextMessage?.text) {
    return { messageType: "text", content: m.extendedTextMessage.text, mediaUrl: null };
  }
  if (m?.imageMessage) {
    return {
      messageType: "image",
      content: m.imageMessage.caption || "",
      mediaUrl: m.imageMessage.url || null,
    };
  }
  if (m?.audioMessage) {
    return { messageType: "audio", content: null, mediaUrl: m.audioMessage.url || null };
  }
  if (m?.videoMessage) {
    return {
      messageType: "video",
      content: m.videoMessage.caption || "",
      mediaUrl: m.videoMessage.url || null,
    };
  }
  if (m?.documentMessage) {
    return {
      messageType: "document",
      content: m.documentMessage.fileName || "",
      mediaUrl: m.documentMessage.url || null,
    };
  }
  if (m?.stickerMessage) {
    return { messageType: "sticker", content: null, mediaUrl: m.stickerMessage.url || null };
  }
  if (m?.protocolMessage) {
    // Protocol messages (read receipts, etc) - skip these
    return { messageType: "protocol", content: null, mediaUrl: null };
  }
  if (m?.reactionMessage) {
    return { messageType: "reaction", content: m.reactionMessage.text || "👍", mediaUrl: null };
  }

  return { messageType: "text", content: null, mediaUrl: null };
};

// Coerce different Evolution API response formats to array
const coerceMessagesArray = (val: any): EvolutionMessage[] => {
  if (Array.isArray(val)) {
    return val as EvolutionMessage[];
  }

  if (val && typeof val === "object") {
    // Evolution API v2 format: { messages: { records: [...] } }
    if (val.messages?.records && Array.isArray(val.messages.records)) {
      return val.messages.records as EvolutionMessage[];
    }
    
    // { messages: [...] }
    if (Array.isArray(val.messages)) {
      return val.messages as EvolutionMessage[];
    }
    
    // { records: [...] }
    if (Array.isArray(val.records)) {
      return val.records as EvolutionMessage[];
    }
    
    // { data: [...] }
    if (Array.isArray(val.data)) {
      return val.data as EvolutionMessage[];
    }

    // { messages: { "0": {...}, "1": {...} } }
    if (val.messages && typeof val.messages === "object" && !Array.isArray(val.messages)) {
      const msgKeys = Object.keys(val.messages);
      if (msgKeys.length > 0 && msgKeys.every((k) => !isNaN(Number(k)))) {
        return Object.values(val.messages) as EvolutionMessage[];
      }
    }

    // { "0": {...}, "1": {...} }
    const keys = Object.keys(val);
    if (keys.length > 0 && keys.every((k) => !isNaN(Number(k)))) {
      return Object.values(val) as EvolutionMessage[];
    }
  }

  return [];
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

    // Get Evolution API config with multiple fallback strategies
    let evolutionBaseUrl: string | undefined;
    let evolutionApiKey: string | undefined;
    let configSource = 'none';

    // Strategy 1: User's own maturador_config
    const { data: userConfig } = await supabaseClient
      .from('maturador_config')
      .select('evolution_base_url, evolution_api_key')
      .eq('user_id', user.id)
      .single();

    if (userConfig?.evolution_base_url && userConfig?.evolution_api_key) {
      evolutionBaseUrl = userConfig.evolution_base_url;
      evolutionApiKey = userConfig.evolution_api_key;
      configSource = 'user_config';
      console.log('Using user Evolution API config');
    }

    // Strategy 2: Admin config from database (fallback)
    if (!evolutionBaseUrl || !evolutionApiKey) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: adminConfig, error: adminConfigError } = await serviceClient
        .from('maturador_config')
        .select('evolution_base_url, evolution_api_key')
        .limit(1)
        .single();

      if (adminConfigError) {
        console.log('Admin config lookup error:', adminConfigError.message);
      }

      if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
        evolutionBaseUrl = adminConfig.evolution_base_url;
        evolutionApiKey = adminConfig.evolution_api_key;
        configSource = 'admin_config';
        console.log('Using admin Evolution API config as fallback');
      }
    }

    // Strategy 3: Global secrets (final fallback)
    if (!evolutionBaseUrl || !evolutionApiKey) {
      const globalBaseUrl = Deno.env.get('EVOLUTION_BASE_URL');
      const globalApiKey = Deno.env.get('EVOLUTION_API_KEY');

      if (globalBaseUrl && globalApiKey) {
        evolutionBaseUrl = globalBaseUrl;
        evolutionApiKey = globalApiKey;
        configSource = 'global_secrets';
        console.log('Using global Evolution API secrets');
      }
    }

    if (!evolutionBaseUrl || !evolutionApiKey) {
      console.error('Evolution API not configured. Tried: user_config, admin_config, global_secrets');
      return new Response(JSON.stringify({ 
        error: 'Evolution API not configured',
        details: 'No valid Evolution API configuration found. Please configure EVOLUTION_BASE_URL and EVOLUTION_API_KEY.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Config source:', configSource);
    const EVOLUTION_BASE_URL = evolutionBaseUrl.replace(/\/$/, '');
    const EVOLUTION_API_KEY = evolutionApiKey;
    const instanceName = instance.instance_name;
    
    // Get instance identifiers for pushName validation
    const instanceLabel = instance.label?.toLowerCase()?.trim() || '';
    const instanceNameLower = instanceName?.toLowerCase()?.trim() || '';
    
    // Function to check if pushName is suspicious (matches instance name/label)
    const isSuspiciousPushName = (name: string | null): boolean => {
      if (!name) return true;
      const nameLower = name.toLowerCase().trim();
      // Check if pushName matches or contains instance label/name
      if (instanceLabel && (nameLower === instanceLabel || nameLower.includes(instanceLabel) || instanceLabel.includes(nameLower))) {
        console.log(`Suspicious pushName detected: "${name}" matches instance label "${instanceLabel}"`);
        return true;
      }
      if (instanceNameLower && (nameLower === instanceNameLower || nameLower.includes(instanceNameLower) || instanceNameLower.includes(nameLower))) {
        console.log(`Suspicious pushName detected: "${name}" matches instance name "${instanceNameLower}"`);
        return true;
      }
      return false;
    };

    console.log(`Fetching chats from ${EVOLUTION_BASE_URL} for instance ${instanceName}`);

    // Fetch chats from Evolution API with error handling
    let chats: any[] = [];
    try {
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
        console.error('Evolution API findChats error:', errorText);
        // Don't fail completely - return partial success with warning
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Evolution API findChats failed',
          details: errorText,
          imported: 0,
          updated: 0,
          skipped: 0,
          total: 0,
          instanceName
        }), {
          status: 200, // Return 200 so client doesn't show error toast
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      chats = await chatsResponse.json();
      console.log(`Found ${chats?.length || 0} chats from Evolution API`);
    } catch (fetchError) {
      console.error('Evolution API fetch error:', fetchError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to connect to Evolution API',
        details: String(fetchError),
        imported: 0,
        updated: 0,
        skipped: 0,
        total: 0,
        instanceName
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

      // Get profile pic from chat data
      let profilePicUrl = chat.profilePictureUrl || chat.imgUrl || null;
      
      // IMPORTANT: Do NOT use chat.pushName or chat.notify at root level
      // They often contain the instance owner's name, not the contact's name
      // We should ONLY get pushName from inbound messages
      let contactName: string | null = null;

      // Try to get pushName from recent INBOUND messages
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
            limit: 20,
          }),
        });

        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          
          // Use the robust coercion function
          const messagesArr = coerceMessagesArray(messagesData);
          
          // Find pushName from incoming messages ONLY (not fromMe) and validate it
          for (const msg of messagesArr) {
            if (msg?.key && !msg.key.fromMe && msg.pushName) {
              // Only use pushName if it's not suspicious
              if (!isSuspiciousPushName(msg.pushName)) {
                contactName = msg.pushName;
                console.log(`Found valid pushName from inbound message for ${phone}: ${contactName}`);
                break;
              } else {
                console.log(`Skipping suspicious pushName for ${phone}: ${msg.pushName}`);
              }
            }
          }
        }
      } catch (e) {
        console.log(`Could not fetch messages to get pushName for ${phone}:`, e);
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
        .select('id, name, profile_pic_url, remote_jid')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .eq('instance_id', instanceId)
        .single();

      if (existingContact) {
        // Update existing contact with new name and profile pic if available
        const updates: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };

        // Update name if we have a new valid one from pushName and it's different from stored
        if (contactName && !isSuspiciousPushName(contactName) && contactName !== existingContact.name) {
          updates.name = contactName;
        }
        
        // Update profile pic if we have a new one
        if (profilePicUrl && profilePicUrl !== existingContact.profile_pic_url) {
          updates.profile_pic_url = profilePicUrl;
        }

        // Update remote_jid if not already set
        if (!existingContact.remote_jid && remoteJid) {
          updates.remote_jid = remoteJid;
          console.log(`Updating contact ${phone} with remote_jid: ${remoteJid}`);
        }

        if (Object.keys(updates).length > 1) {
          await supabaseClient
            .from('inbox_contacts')
            .update(updates)
            .eq('id', existingContact.id);
          console.log(`Updated contact ${phone} with new data: name=${updates.name || 'unchanged'}, pic=${updates.profile_pic_url ? 'updated' : 'unchanged'}, jid=${updates.remote_jid || 'unchanged'}`);
        }
        updated++;
        continue;
      }

      // Create new contact with remote_jid
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
          remote_jid: remoteJid, // Save the JID for reliable message syncing
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
            
            // Use the robust coercion function
            const messagesArr = coerceMessagesArray(messagesData);
            
            console.log(`Fetched ${messagesArr.length} messages for ${phone}`);

            let messagesImported = 0;
            let messagesSkipped = 0;
            let foundPushName = null;
            
            for (const msg of messagesArr.slice(0, 100)) {
              const key = msg.key || {};
              const direction = key.fromMe ? 'outbound' : 'inbound';
              
              // Extract pushName from incoming messages
              if (!key.fromMe && msg.pushName && !foundPushName) {
                foundPushName = msg.pushName;
              }
              
              // Use the robust parser
              const { content, messageType, mediaUrl } = parseEvolutionContent(msg);
              
              // Skip protocol messages (read receipts, etc)
              if (messageType === 'protocol') {
                messagesSkipped++;
                continue;
              }

              // Skip empty messages but log for debugging
              if (!content && !mediaUrl) {
                messagesSkipped++;
                continue;
              }

              const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) : 0;
              const createdAt = ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString();

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
                  status: direction === 'outbound' ? 'sent' : 'delivered',
                  is_from_flow: false,
                  created_at: createdAt,
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
            
            console.log(`Imported ${messagesImported} messages for ${phone}, skipped ${messagesSkipped}`);
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
