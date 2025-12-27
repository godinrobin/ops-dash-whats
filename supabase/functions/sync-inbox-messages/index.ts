import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EvolutionMessage = {
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
    remoteJidAlt?: string;
  };
  pushName?: string;
  messageTimestamp?: number | string;
  message?: any;
};

const extractPhoneFromJid = (jid: string): string => {
  const base = (jid || "").split("@")[0];
  return base.replace(/\D/g, "");
};

const parseEvolutionContent = (msg: EvolutionMessage): { content: string | null; messageType: string; mediaUrl: string | null } => {
  const m = msg.message || {};
  
  // Some Evolution API versions return messageType at root with actual content in message
  const rootMessageType = (msg as any).messageType;

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
    return { messageType: "audio", content: "", mediaUrl: m.audioMessage.url || null };
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
    return { messageType: "sticker", content: "", mediaUrl: m.stickerMessage.url || null };
  }
  if (m?.protocolMessage) {
    // Protocol messages (read receipts, etc) - skip these
    return { messageType: "protocol", content: null, mediaUrl: null };
  }
  if (m?.reactionMessage) {
    return { messageType: "reaction", content: m.reactionMessage.text || "👍", mediaUrl: null };
  }
  
  // If we have a root messageType, use it
  if (rootMessageType) {
    return { messageType: rootMessageType, content: null, mediaUrl: null };
  }

  return { messageType: "text", content: null, mediaUrl: null };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { contactId, limit = 30 } = await req.json();

    if (!contactId) {
      return new Response(JSON.stringify({ error: "Missing contactId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contact, error: contactError } = await supabaseClient
      .from("inbox_contacts")
      .select("id, phone, instance_id, user_id")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .single();

    if (contactError || !contact) {
      return new Response(JSON.stringify({ error: "Contact not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contact.instance_id) {
      return new Response(JSON.stringify({ inserted: 0, reason: "No instance linked to contact" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instance } = await supabaseClient
      .from("maturador_instances")
      .select("instance_name")
      .eq("id", contact.instance_id)
      .eq("user_id", user.id)
      .single();

    const instanceName = instance?.instance_name;

    if (!instanceName) {
      return new Response(JSON.stringify({ inserted: 0, reason: "Instance not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Evolution API config with multiple fallback strategies
    let evolutionBaseUrl: string | undefined;
    let evolutionApiKey: string | undefined;
    let configSource = 'none';

    // Strategy 1: User's own maturador_config
    const { data: userConfig } = await supabaseClient
      .from("maturador_config")
      .select("evolution_base_url, evolution_api_key")
      .eq("user_id", user.id)
      .single();

    if (userConfig?.evolution_base_url && userConfig?.evolution_api_key) {
      evolutionBaseUrl = userConfig.evolution_base_url;
      evolutionApiKey = userConfig.evolution_api_key;
      configSource = 'user_config';
      console.log("Using user Evolution API config");
    }

    // Strategy 2: Admin config from database (fallback)
    if (!evolutionBaseUrl || !evolutionApiKey) {
      const { data: adminConfig, error: adminConfigError } = await supabaseAdmin
        .from("maturador_config")
        .select("evolution_base_url, evolution_api_key")
        .limit(1)
        .single();

      if (adminConfigError) {
        console.log("Admin config lookup error:", adminConfigError.message);
      }

      if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
        evolutionBaseUrl = adminConfig.evolution_base_url;
        evolutionApiKey = adminConfig.evolution_api_key;
        configSource = 'admin_config';
        console.log("Using admin Evolution API config as fallback");
      }
    }

    // Strategy 3: Global secrets (final fallback)
    if (!evolutionBaseUrl || !evolutionApiKey) {
      const globalBaseUrl = Deno.env.get("EVOLUTION_BASE_URL");
      const globalApiKey = Deno.env.get("EVOLUTION_API_KEY");

      if (globalBaseUrl && globalApiKey) {
        evolutionBaseUrl = globalBaseUrl;
        evolutionApiKey = globalApiKey;
        configSource = 'global_secrets';
        console.log("Using global Evolution API secrets");
      }
    }

    if (!evolutionBaseUrl || !evolutionApiKey) {
      console.error("Evolution API not configured. Tried: user_config, admin_config, global_secrets");
      return new Response(JSON.stringify({ 
        error: "Evolution API not configured",
        details: "No valid Evolution API configuration found."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Config source:", configSource);
    const EVOLUTION_BASE_URL = evolutionBaseUrl.replace(/\/$/, "");
    const EVOLUTION_API_KEY = evolutionApiKey;

    // Find remoteJid for this phone (more reliable than guessing @c.us vs @s.whatsapp.net)
    let chats: any[] = [];
    let remoteJid: string | null = null;
    const cleanPhone = String(contact.phone || "").replace(/\D/g, "");

    try {
      const chatsRes = await fetch(`${EVOLUTION_BASE_URL}/chat/findChats/${instanceName}`, {
        method: "POST",
        headers: {
          apikey: EVOLUTION_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (chatsRes.ok) {
        chats = await chatsRes.json();
        const matchedChat = (Array.isArray(chats) ? chats : []).find((c: any) => {
          const jid = c?.id || c?.remoteJid || "";
          return extractPhoneFromJid(jid) === cleanPhone;
        });
        remoteJid = matchedChat?.id || matchedChat?.remoteJid || null;
      } else {
        // Evolution API can fail with internal errors on some corrupted chats
        // Fall back to constructing the JID manually
        console.warn("findChats failed, falling back to manual JID construction");
      }
    } catch (chatError) {
      console.warn("findChats error, falling back to manual JID construction:", chatError);
    }

    // If we couldn't get remoteJid from findChats, try to construct it manually
    if (!remoteJid && cleanPhone) {
      // Try the standard WhatsApp JID format
      remoteJid = `${cleanPhone}@s.whatsapp.net`;
      console.log("Using manually constructed JID:", remoteJid);
    }

    if (!remoteJid) {
      return new Response(JSON.stringify({ inserted: 0, reason: "Chat not found for phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msgsRes = await fetch(`${EVOLUTION_BASE_URL}/chat/findMessages/${instanceName}`, {
      method: "POST",
      headers: {
        apikey: EVOLUTION_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        where: { key: { remoteJid } },
        limit,
      }),
    });

    if (!msgsRes.ok) {
      const errorText = await msgsRes.text();
      console.error("findMessages failed:", errorText);
      return new Response(JSON.stringify({ error: "Failed to fetch messages", details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msgsData = await msgsRes.json();
    console.log(
      "findMessages response type:",
      typeof msgsData,
      "isArray:",
      Array.isArray(msgsData)
    );

    const coerceMessagesArray = (val: any): EvolutionMessage[] => {
      console.log("coerceMessagesArray input type:", typeof val, "isArray:", Array.isArray(val));
      
      if (Array.isArray(val)) {
        console.log("Input is direct array, length:", val.length);
        return val as EvolutionMessage[];
      }

      if (val && typeof val === "object") {
        const topKeys = Object.keys(val).slice(0, 10);
        console.log("Input is object with keys:", topKeys);
        
        // Evolution API v2 format: { messages: { records: [...] } }
        if (val.messages?.records && Array.isArray(val.messages.records)) {
          console.log("Found val.messages.records array, length:", val.messages.records.length);
          if (val.messages.records.length > 0) {
            console.log("First message sample:", JSON.stringify(val.messages.records[0]).slice(0, 300));
          }
          return val.messages.records as EvolutionMessage[];
        }
        
        // common wrappers: { messages: [...] }
        if (Array.isArray(val.messages)) {
          console.log("Found val.messages array, length:", val.messages.length);
          if (val.messages.length > 0) {
            console.log("First message sample:", JSON.stringify(val.messages[0]).slice(0, 300));
          }
          return val.messages as EvolutionMessage[];
        }
        
        // { records: [...] }
        if (Array.isArray(val.records)) {
          console.log("Found val.records array, length:", val.records.length);
          return val.records as EvolutionMessage[];
        }
        
        // { data: [...] }
        if (Array.isArray(val.data)) {
          console.log("Found val.data array, length:", val.data.length);
          return val.data as EvolutionMessage[];
        }

        // sometimes messages can be { messages: { "0": {...}, "1": {...} } }
        if (val.messages && typeof val.messages === "object" && !Array.isArray(val.messages)) {
          const msgKeys = Object.keys(val.messages);
          console.log("val.messages is object with keys:", msgKeys.slice(0, 5));
          if (msgKeys.length > 0 && msgKeys.every((k) => !isNaN(Number(k)))) {
            const arr = Object.values(val.messages) as EvolutionMessage[];
            console.log("Converted val.messages object to array, length:", arr.length);
            return arr;
          }
        }

        // object with numeric keys at root { "0": {...}, "1": {...} }
        const keys = Object.keys(val);
        if (keys.length > 0 && keys.every((k) => !isNaN(Number(k)))) {
          const arr = Object.values(val) as EvolutionMessage[];
          console.log("Converted root numeric-keyed object to array, length:", arr.length);
          return arr;
        }

        console.log("Could not parse messages, returning empty. Full response preview:", JSON.stringify(val).slice(0, 500));
      }

      console.log("Fallback: returning empty array");
      return []
    };

    const messagesArr = coerceMessagesArray(msgsData);
    console.log(
      "Parsed messages count:",
      messagesArr.length,
      "messagesArr isArray:",
      Array.isArray(messagesArr)
    );
    
    // Log first message structure for debugging parse issues
    if (messagesArr.length > 0) {
      const firstMsg = messagesArr[0];
      const parsed = parseEvolutionContent(firstMsg);
      console.log("First message parse test:", {
        hasMessage: !!firstMsg.message,
        messageKeys: firstMsg.message ? Object.keys(firstMsg.message).slice(0, 5) : [],
        rootMessageType: (firstMsg as any).messageType,
        parsedResult: parsed,
      });
    }

    // Include both inbound and outbound messages
    const allMessages = (Array.isArray(messagesArr) ? messagesArr : []).filter((m) => m && m?.key?.id);
    const remoteIds = allMessages.map((m) => m?.key?.id).filter(Boolean) as string[];

    console.log("Total messages:", allMessages.length, "Remote IDs:", remoteIds.length);

    if (remoteIds.length === 0) {
      console.log("No messages with valid key.id found");
      return new Response(JSON.stringify({ inserted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingRows } = await supabaseAdmin
      .from("inbox_messages")
      .select("remote_message_id")
      .eq("contact_id", contact.id)
      .in("remote_message_id", remoteIds);

    const existing = new Set((existingRows || []).map((r: any) => r.remote_message_id).filter(Boolean));

    let skippedExisting = 0;
    let skippedEmpty = 0;
    let skippedProtocol = 0;
    
    const rowsToInsert = allMessages
      .filter((m) => {
        const id = m?.key?.id;
        if (!id) return false;
        if (existing.has(id)) {
          skippedExisting++;
          return false;
        }
        return true;
      })
      .map((m) => {
        const { content, messageType, mediaUrl } = parseEvolutionContent(m);
        const ts = m.messageTimestamp ? Number(m.messageTimestamp) : 0;
        const createdAt = ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString();
        const isFromMe = m?.key?.fromMe === true;

        return {
          contact_id: contact.id,
          instance_id: contact.instance_id,
          user_id: user.id,
          direction: isFromMe ? "outbound" : "inbound",
          message_type: messageType,
          content,
          media_url: mediaUrl,
          remote_message_id: m.key?.id,
          status: isFromMe ? "sent" : "delivered",
          is_from_flow: false,
          created_at: createdAt,
        };
      })
      // ignore protocol and empty messages
      .filter((r) => {
        if (r.message_type === "protocol") {
          skippedProtocol++;
          return false;
        }
        const hasContent = r.content && String(r.content).length > 0;
        const hasMedia = !!r.media_url;
        if (!hasContent && !hasMedia) {
          skippedEmpty++;
          return false;
        }
        return true;
      });

    console.log(`Filtering results: skippedExisting=${skippedExisting}, skippedProtocol=${skippedProtocol}, skippedEmpty=${skippedEmpty}, toInsert=${rowsToInsert.length}`);

    if (rowsToInsert.length === 0) {
      console.log("No new messages to insert after filtering");
      return new Response(JSON.stringify({ inserted: 0, skippedExisting, skippedProtocol, skippedEmpty }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertError } = await supabaseAdmin.from("inbox_messages").insert(rowsToInsert);

    if (insertError) {
      console.error("Insert inbox_messages failed:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save messages" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last_message_at with the most recent message timestamp
    const latestMessage = rowsToInsert.reduce((latest, msg) => {
      if (!latest) return msg;
      return new Date(msg.created_at) > new Date(latest.created_at) ? msg : latest;
    }, null as typeof rowsToInsert[0] | null);

    if (latestMessage) {
      await supabaseAdmin
        .from("inbox_contacts")
        .update({
          last_message_at: latestMessage.created_at,
        })
        .eq("id", contact.id);
    }

    const inboundCount = rowsToInsert.filter(r => r.direction === 'inbound').length;
    const outboundCount = rowsToInsert.filter(r => r.direction === 'outbound').length;
    console.log(`Synced messages for contact ${contact.id}: inserted=${rowsToInsert.length} (inbound=${inboundCount}, outbound=${outboundCount})`);

    return new Response(JSON.stringify({ inserted: rowsToInsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const error = err as Error;
    console.error("sync-inbox-messages error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
