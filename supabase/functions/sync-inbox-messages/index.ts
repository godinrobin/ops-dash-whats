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
  };
  pushName?: string;
  messageTimestamp?: number;
  message?: any;
};

const extractPhoneFromJid = (jid: string): string => {
  const base = (jid || "").split("@")[0];
  return base.replace(/\D/g, "");
};

const parseEvolutionContent = (msg: EvolutionMessage): { content: string | null; messageType: string; mediaUrl: string | null } => {
  const m = msg.message || {};

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

    const { data: config } = await supabaseClient
      .from("maturador_config")
      .select("evolution_base_url, evolution_api_key")
      .eq("user_id", user.id)
      .single();

    if (!config?.evolution_base_url || !config?.evolution_api_key) {
      return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const EVOLUTION_BASE_URL = config.evolution_base_url.replace(/\/$/, "");
    const EVOLUTION_API_KEY = config.evolution_api_key;

    // Find remoteJid for this phone (more reliable than guessing @c.us vs @s.whatsapp.net)
    const chatsRes = await fetch(`${EVOLUTION_BASE_URL}/chat/findChats/${instanceName}`, {
      method: "POST",
      headers: {
        apikey: EVOLUTION_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!chatsRes.ok) {
      const errorText = await chatsRes.text();
      console.error("findChats failed:", errorText);
      return new Response(JSON.stringify({ error: "Failed to fetch chats", details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chats = await chatsRes.json();
    const cleanPhone = String(contact.phone || "").replace(/\D/g, "");

    const matchedChat = (Array.isArray(chats) ? chats : []).find((c: any) => {
      const jid = c?.id || c?.remoteJid || "";
      return extractPhoneFromJid(jid) === cleanPhone;
    });

    const remoteJid = matchedChat?.id || matchedChat?.remoteJid || null;

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
    const messages: EvolutionMessage[] = (msgsData?.messages || msgsData || []) as EvolutionMessage[];

    // Only inbound messages
    const inbound = messages.filter((m) => !m?.key?.fromMe);
    const remoteIds = inbound.map((m) => m?.key?.id).filter(Boolean) as string[];

    if (remoteIds.length === 0) {
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

    const rowsToInsert = inbound
      .filter((m) => {
        const id = m?.key?.id;
        return id && !existing.has(id);
      })
      .map((m) => {
        const { content, messageType, mediaUrl } = parseEvolutionContent(m);
        const createdAt = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : new Date().toISOString();

        return {
          contact_id: contact.id,
          instance_id: contact.instance_id,
          user_id: user.id,
          direction: "inbound",
          message_type: messageType,
          content,
          media_url: mediaUrl,
          remote_message_id: m.key?.id,
          status: "delivered",
          is_from_flow: false,
          created_at: createdAt,
        };
      })
      // ignore empty messages
      .filter((r) => (r.content && String(r.content).length > 0) || r.media_url);

    if (rowsToInsert.length === 0) {
      return new Response(JSON.stringify({ inserted: 0 }), {
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

    // bump contact metadata
    await supabaseAdmin
      .from("inbox_contacts")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: (matchedChat?.unreadCount ?? undefined),
      })
      .eq("id", contact.id);

    console.log(`Synced inbound messages for contact ${contact.id}: inserted=${rowsToInsert.length}`);

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
