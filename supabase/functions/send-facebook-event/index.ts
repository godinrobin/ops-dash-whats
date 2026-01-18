import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to hash data for Facebook
async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Supported Facebook events
const SUPPORTED_EVENTS = ["Purchase", "Lead", "InitiateCheckout", "AddToCart"];

interface SendEventPayload {
  phone?: string;
  event_name: string; // "Purchase", "Lead", "InitiateCheckout", "AddToCart"
  value?: number;
  currency?: string;
  ctwa_clid?: string;
  fbclid?: string;
  contact_id?: string; // Optional: for inbox contacts
  pixel_id?: string; // Optional: for specific pixel
}

interface EventLogEntry {
  user_id: string;
  contact_id?: string;
  phone: string;
  event_name: string;
  event_value?: number;
  pixel_id: string;
  action_source: string;
  page_id?: string;
  ctwa_clid?: string;
  success: boolean;
  error_message?: string;
  facebook_trace_id?: string;
  events_received?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: SendEventPayload = await req.json();
    const { event_name, value, currency, ctwa_clid, fbclid, contact_id, pixel_id } = payload;
    let phone = payload.phone;

    console.log("[SEND-FB-EVENT] Request:", { event_name, phone, contact_id, ctwa_clid, pixel_id });

    // If contact_id is provided, get phone and ctwa_clid from inbox_contacts
    let finalCtwaClid = ctwa_clid;
    if (contact_id && !phone) {
      const { data: contact } = await supabaseClient
        .from("inbox_contacts")
        .select("phone, ctwa_clid")
        .eq("id", contact_id)
        .eq("user_id", user.id)
        .single();
      
      if (contact) {
        phone = contact.phone;
        finalCtwaClid = contact.ctwa_clid || ctwa_clid;
      }
    }

    if (!phone) {
      return new Response(JSON.stringify({ error: "Phone number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!event_name || !SUPPORTED_EVENTS.includes(event_name)) {
      return new Response(JSON.stringify({ 
        error: `Invalid event_name. Must be one of: ${SUPPORTED_EVENTS.join(", ")}`
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's pixels - optionally filter by specific pixel_id
    let pixelQuery = supabaseClient
      .from("user_facebook_pixels")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (pixel_id) {
      pixelQuery = pixelQuery.eq("pixel_id", pixel_id);
    }

    const { data: pixels, error: pixelsError } = await pixelQuery;

    if (pixelsError || !pixels || pixels.length === 0) {
      return new Response(JSON.stringify({ 
        error: pixel_id ? "Pixel específico não encontrado ou inativo" : "No active pixels configured",
        message: "Configure seus pixels em Configurações > Pixel do Facebook"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[SEND-FB-EVENT] Found ${pixels.length} active pixels for user`);

    // Hash the phone number
    const hashedPhone = await hashData(phone);

    const results: { 
      pixel_id: string; 
      success: boolean; 
      error?: string; 
      events_received?: number;
      warning?: string;
      action_source?: string;
    }[] = [];
    
    const eventLogs: EventLogEntry[] = [];

    // Send event to each pixel
    for (const pixel of pixels) {
      try {
        // Check if this pixel has page_id configured (for Business Messaging)
        const hasPageId = !!pixel.page_id;
        const hasCtwaClid = !!finalCtwaClid;
        
        // Determine if we should use Business Messaging
        const isBusinessMessaging = hasPageId && hasCtwaClid;
        const actionSource = isBusinessMessaging ? "business_messaging" : "website";
        
        // Generate warnings for misconfigurations
        let warning: string | undefined;
        if (hasPageId && !hasCtwaClid) {
          warning = "Pixel configurado para Business Messaging mas contato não possui CTWA CLID. O evento foi enviado como 'website'.";
          console.warn(`[SEND-FB-EVENT] Warning for pixel ${pixel.pixel_id}: ${warning}`);
        }
        
        console.log(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id}, page_id: ${pixel.page_id || 'none'}, ctwa_clid: ${finalCtwaClid || 'none'}, action_source: ${actionSource}`);

        const eventData: any = {
          event_name,
          event_time: Math.floor(Date.now() / 1000),
          action_source: actionSource,
          user_data: {
            ph: [hashedPhone],
          },
        };

        // Business Messaging payload per Meta CAPI docs:
        // For WhatsApp: messaging_channel = "whatsapp", user_data contains page_id + ctwa_clid
        // For Messenger: messaging_channel = "messenger", user_data contains page_id + page_scoped_user_id
        // NOTE: client_user_agent is NOT allowed for business_messaging.
        if (isBusinessMessaging) {
          eventData.messaging_channel = "whatsapp";
          eventData.user_data.page_id = pixel.page_id;
          eventData.user_data.ctwa_clid = finalCtwaClid;
          console.log(
            `[SEND-FB-EVENT] Using Business Messaging (WhatsApp) with page_id: ${pixel.page_id}, ctwa_clid: ${finalCtwaClid}`,
          );
        } else {
          // For website action_source, use client_user_agent and fbc/fbp
          eventData.user_data.client_user_agent = req.headers.get("user-agent") || "";
          if (fbclid) {
            eventData.user_data.fbc = `fb.1.${Date.now()}.${fbclid}`;
          }
          if (finalCtwaClid) {
            eventData.user_data.fbp = finalCtwaClid;
          }
        }

        // Add custom_data for events that support value
        if (["Purchase", "InitiateCheckout", "AddToCart"].includes(event_name)) {
          eventData.custom_data = {
            currency: currency || "BRL",
            value: value || 0,
          };
        }

        const eventsUrl = `https://graph.facebook.com/v21.0/${pixel.pixel_id}/events`;
        const eventsResponse = await fetch(eventsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: [eventData],
            access_token: pixel.access_token,
          }),
        });

        const eventsResult = await eventsResponse.json();
        
        console.log(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id} full response:`, JSON.stringify(eventsResult));

        // Prepare log entry
        const logEntry: EventLogEntry = {
          user_id: user.id,
          contact_id: contact_id || undefined,
          phone,
          event_name,
          event_value: event_name === "Purchase" ? (value || 0) : undefined,
          pixel_id: pixel.pixel_id,
          action_source: actionSource,
          page_id: pixel.page_id || undefined,
          ctwa_clid: finalCtwaClid || undefined,
          success: false,
        };

        if (eventsResult.error) {
          console.error(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id} error:`, eventsResult.error);
          
          // Parse Facebook error for better user feedback
          let errorMessage = eventsResult.error.message;
          const subcode = eventsResult.error.error_subcode;
          if (subcode === 2804024) {
            errorMessage = "Este lead não veio da mesma página do pixel selecionado, selecione outro pixel.";
          } else if (subcode === 2804003) {
            errorMessage = "Não foi possível pegar as informações de anúncio do lead.";
          }
          
          logEntry.error_message = errorMessage;
          eventLogs.push(logEntry);
          
          results.push({
            pixel_id: pixel.pixel_id,
            success: false,
            error: errorMessage,
            warning,
            action_source: actionSource,
          });
        } else {
          console.log(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id} success:`, eventsResult);
          
          logEntry.success = true;
          logEntry.facebook_trace_id = eventsResult.fbtrace_id;
          logEntry.events_received = eventsResult.events_received;
          eventLogs.push(logEntry);
          
          results.push({
            pixel_id: pixel.pixel_id,
            success: true,
            events_received: eventsResult.events_received,
            warning,
            action_source: actionSource,
          });
        }
      } catch (err: any) {
        console.error(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id} exception:`, err);
        
        const logEntry: EventLogEntry = {
          user_id: user.id,
          contact_id: contact_id || undefined,
          phone,
          event_name,
          event_value: event_name === "Purchase" ? (value || 0) : undefined,
          pixel_id: pixel.pixel_id,
          action_source: "unknown",
          success: false,
          error_message: err.message,
        };
        eventLogs.push(logEntry);
        
        results.push({
          pixel_id: pixel.pixel_id,
          success: false,
          error: err.message,
        });
      }
    }

    // Save all event logs to database
    if (eventLogs.length > 0) {
      const { error: logError } = await supabaseClient
        .from("facebook_event_logs")
        .insert(eventLogs);
      
      if (logError) {
        console.error("[SEND-FB-EVENT] Failed to save event logs:", logError);
      } else {
        console.log(`[SEND-FB-EVENT] Saved ${eventLogs.length} event logs`);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const hasWarnings = results.some(r => r.warning);

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        total_pixels: pixels.length,
        successful: successCount,
        has_warnings: hasWarnings,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[SEND-FB-EVENT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});