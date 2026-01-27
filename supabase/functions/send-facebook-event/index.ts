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
  event_id?: string; // Optional: unique event ID for deduplication control
  quantity?: number; // Optional: number of events to send (1-100), backend will loop
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
    const { event_name, value, currency, ctwa_clid, fbclid, contact_id, pixel_id, event_id } = payload;
    const quantity = Math.min(Math.max(payload.quantity || 1, 1), 100); // Limit 1-100 events
    let phone = payload.phone;

    console.log("[SEND-FB-EVENT] Request:", { event_name, phone, contact_id, ctwa_clid, pixel_id, event_id, quantity });

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
    let totalEventsSent = 0;

    console.log(`[SEND-FB-EVENT] Processing ${quantity} event(s) for ${pixels.length} pixel(s) in BATCH mode`);

    // Send events to each pixel - all events in a single batch request
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

        // Build array of events for batch request
        const eventsArray: any[] = [];
        const baseTimestamp = Math.floor(Date.now() / 1000);
        
        for (let eventIndex = 0; eventIndex < quantity; eventIndex++) {
          // Generate unique identifiers for each event
          const baseEventId = event_id || `fb_${Date.now()}_${phone.slice(-4)}`;
          const uniqueEventId = quantity > 1 
            ? `${baseEventId}_${eventIndex}_${crypto.randomUUID().slice(0, 8)}`
            : baseEventId;
          
          // Each event gets different timestamp (1 second apart going backwards)
          const eventTimestamp = baseTimestamp - (eventIndex * 1);
          
          // Unique external_id for each event
          const externalId = `${eventTimestamp}_${crypto.randomUUID()}`;
          
          const eventData: any = {
            event_name,
            event_time: eventTimestamp,
            event_id: uniqueEventId,
            action_source: actionSource,
            user_data: {
              ph: [hashedPhone],
              external_id: [externalId],
            },
          };

          // Business Messaging payload per Meta CAPI docs
          if (isBusinessMessaging) {
            eventData.messaging_channel = "whatsapp";
            eventData.user_data.page_id = pixel.page_id;
            eventData.user_data.ctwa_clid = finalCtwaClid;
          } else {
            eventData.user_data.client_user_agent = req.headers.get("user-agent") || "";
            if (fbclid) {
              eventData.user_data.fbc = `fb.1.${Date.now()}.${fbclid}`;
            }
            if (finalCtwaClid) {
              eventData.user_data.fbp = finalCtwaClid;
            }
          }

          // Add custom_data for events that support value
          // Increment value by 1 centavo per event to ensure uniqueness
          let eventValue: number | undefined;
          if (["Purchase", "InitiateCheckout", "AddToCart"].includes(event_name)) {
            const baseValue = value || 0;
            const incrementedValue = baseValue + (eventIndex * 0.01);
            eventValue = Math.round(incrementedValue * 100) / 100;
            
            // Unique order and product IDs
            const uniqueOrderId = `order_${Date.now()}_${eventIndex}_${crypto.randomUUID().slice(0, 8)}`;
            const uniqueProductId = `product_${eventIndex}_${Date.now()}`;
            
            eventData.custom_data = {
              currency: currency || "BRL",
              value: eventValue,
              order_id: uniqueOrderId,
              content_type: "product",
              content_ids: [uniqueProductId],
              contents: [{
                id: uniqueProductId,
                quantity: 1,
                item_price: eventValue,
              }],
              num_items: 1,
            };
          }

          eventsArray.push(eventData);
          
          // Create log entry for this event
          eventLogs.push({
            user_id: user.id,
            contact_id: contact_id || undefined,
            phone,
            event_name,
            event_value: eventValue,
            pixel_id: pixel.pixel_id,
            action_source: actionSource,
            page_id: pixel.page_id || undefined,
            ctwa_clid: finalCtwaClid || undefined,
            success: false, // Will be updated after batch response
          });
        }

        console.log(`[SEND-FB-EVENT] Sending BATCH of ${eventsArray.length} events to pixel ${pixel.pixel_id}`);

        // Send ALL events in a single batch request
        const eventsUrl = `https://graph.facebook.com/v21.0/${pixel.pixel_id}/events`;
        const eventsResponse = await fetch(eventsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: eventsArray, // Array with ALL events
            access_token: pixel.access_token,
          }),
        });

        const eventsResult = await eventsResponse.json();
        console.log(`[SEND-FB-EVENT] Batch response for pixel ${pixel.pixel_id}:`, JSON.stringify(eventsResult));

        if (eventsResult.error) {
          console.error(`[SEND-FB-EVENT] Batch error for pixel ${pixel.pixel_id}:`, eventsResult.error);
          
          // Parse Facebook error for better user feedback
          let errorMessage = eventsResult.error.message;
          const subcode = eventsResult.error.error_subcode;
          if (subcode === 2804024) {
            errorMessage = "Este lead não veio da mesma página do pixel selecionado, selecione outro pixel.";
          } else if (subcode === 2804003) {
            errorMessage = "Não foi possível pegar as informações de anúncio do lead.";
          }
          
          // Mark all logs for this pixel as failed
          const pixelLogStart = eventLogs.length - quantity;
          for (let i = pixelLogStart; i < eventLogs.length; i++) {
            eventLogs[i].error_message = errorMessage;
          }
          
          results.push({
            pixel_id: pixel.pixel_id,
            success: false,
            error: errorMessage,
            warning,
            action_source: actionSource,
          });
        } else {
          // Success! Mark all logs for this pixel as successful
          const pixelLogStart = eventLogs.length - quantity;
          for (let i = pixelLogStart; i < eventLogs.length; i++) {
            eventLogs[i].success = true;
            eventLogs[i].facebook_trace_id = eventsResult.fbtrace_id;
            eventLogs[i].events_received = eventsResult.events_received;
          }
          
          totalEventsSent += eventsResult.events_received || quantity;
          
          results.push({
            pixel_id: pixel.pixel_id,
            success: true,
            events_received: eventsResult.events_received,
            warning,
            action_source: actionSource,
          });
          
          console.log(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id} received ${eventsResult.events_received} events`);
        }
      } catch (err: any) {
        console.error(`[SEND-FB-EVENT] Exception for pixel ${pixel.pixel_id}:`, err);
        
        // Mark last batch of logs as failed
        const pixelLogStart = eventLogs.length - quantity;
        for (let i = Math.max(0, pixelLogStart); i < eventLogs.length; i++) {
          eventLogs[i].error_message = err.message;
        }
        
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

    console.log(`[SEND-FB-EVENT] Completed: ${totalEventsSent}/${quantity * pixels.length} events sent successfully`);

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        total_pixels: pixels.length,
        successful: successCount,
        has_warnings: hasWarnings,
        total_events_sent: totalEventsSent,
        quantity_requested: quantity,
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