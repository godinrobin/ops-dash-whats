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

interface SendEventPayload {
  phone?: string;
  event_name: string; // "Purchase" or "Lead"
  value?: number;
  currency?: string;
  ctwa_clid?: string;
  fbclid?: string;
  contact_id?: string; // Optional: for inbox contacts
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
    const { event_name, value, currency, ctwa_clid, fbclid, contact_id } = payload;
    let phone = payload.phone;

    console.log("[SEND-FB-EVENT] Request:", { event_name, phone, contact_id, ctwa_clid });

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

    if (!event_name || !["Purchase", "Lead"].includes(event_name)) {
      return new Response(JSON.stringify({ error: "Invalid event_name. Must be 'Purchase' or 'Lead'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all user's pixels
    const { data: pixels, error: pixelsError } = await supabaseClient
      .from("user_facebook_pixels")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (pixelsError || !pixels || pixels.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No active pixels configured",
        message: "Configure seus pixels em Configurações > Pixel do Facebook"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[SEND-FB-EVENT] Found ${pixels.length} active pixels for user`);

    // Hash the phone number
    const hashedPhone = await hashData(phone);

    const results: { pixel_id: string; success: boolean; error?: string; events_received?: number }[] = [];

    // Send event to each pixel
    for (const pixel of pixels) {
      try {
        const eventData = {
          event_name,
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          user_data: {
            ph: [hashedPhone],
            client_user_agent: req.headers.get("user-agent") || "",
            fbc: fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined,
            fbp: finalCtwaClid || undefined,
          },
          custom_data: event_name === "Purchase" ? {
            currency: currency || "BRL",
            value: value || 0,
          } : undefined,
        };

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

        if (eventsResult.error) {
          console.error(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id} error:`, eventsResult.error);
          results.push({
            pixel_id: pixel.pixel_id,
            success: false,
            error: eventsResult.error.message,
          });
        } else {
          console.log(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id} success:`, eventsResult);
          results.push({
            pixel_id: pixel.pixel_id,
            success: true,
            events_received: eventsResult.events_received,
          });
        }
      } catch (err: any) {
        console.error(`[SEND-FB-EVENT] Pixel ${pixel.pixel_id} exception:`, err);
        results.push({
          pixel_id: pixel.pixel_id,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        total_pixels: pixels.length,
        successful: successCount,
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
