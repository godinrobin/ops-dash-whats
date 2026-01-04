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

    const { leadId, eventName, value, currency } = await req.json();
    console.log("Facebook Conversions API - Event:", eventName, "Lead:", leadId);

    // Get the lead with instance and WhatsApp number info
    const { data: lead, error: leadError } = await supabaseClient
      .from("ads_whatsapp_leads")
      .select("*, ads_whatsapp_numbers(*)")
      .eq("id", leadId)
      .eq("user_id", user.id)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the pixel ID from the ad account
    // First try to get from ads_pixels table (selected pixel)
    const { data: adAccounts } = await supabaseClient
      .from("ads_ad_accounts")
      .select("*, ads_facebook_accounts(*)")
      .eq("user_id", user.id)
      .eq("is_selected", true)
      .limit(1);

    if (!adAccounts || adAccounts.length === 0) {
      return new Response(JSON.stringify({ error: "No ad account selected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adAccount = adAccounts[0];
    const accessToken = adAccount.ads_facebook_accounts?.access_token;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No access token found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to get selected pixel from database first
    const { data: selectedPixel } = await supabaseClient
      .from("ads_pixels")
      .select("pixel_id, name")
      .eq("ad_account_id", adAccount.id)
      .eq("is_selected", true)
      .maybeSingle();

    let pixelId: string;

    if (selectedPixel) {
      pixelId = selectedPixel.pixel_id;
      console.log("Using selected pixel from DB:", pixelId);
    } else {
      // Fallback: Get pixel ID from Facebook API
      const pixelUrl = `https://graph.facebook.com/v21.0/act_${adAccount.ad_account_id}/adspixels?fields=id,name&access_token=${accessToken}`;
      const pixelResponse = await fetch(pixelUrl);
      const pixelData = await pixelResponse.json();

      if (pixelData.error || !pixelData.data || pixelData.data.length === 0) {
        console.error("No pixel found:", pixelData.error);
        return new Response(JSON.stringify({ error: "No pixel found for this ad account. Selecione um pixel na configuração." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      pixelId = pixelData.data[0].id;
      console.log("Using first pixel from Facebook (fallback):", pixelId);
    }

    // Hash the phone number for privacy
    const hashedPhone = await hashData(lead.phone);

    // Prepare event data
    const eventData = {
      event_name: eventName || "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      user_data: {
        ph: [hashedPhone],
        client_user_agent: req.headers.get("user-agent") || "",
        fbc: lead.fbclid ? `fb.1.${Date.now()}.${lead.fbclid}` : undefined,
        fbp: lead.ctwa_clid || undefined,
      },
      custom_data: {
        currency: currency || "BRL",
        value: value || 0,
      },
    };

    // Send event to Facebook Conversions API
    const eventsUrl = `https://graph.facebook.com/v21.0/${pixelId}/events`;
    const eventsResponse = await fetch(eventsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [eventData],
        access_token: accessToken,
      }),
    });

    const eventsResult = await eventsResponse.json();

    if (eventsResult.error) {
      console.error("Conversions API error:", eventsResult.error);
      return new Response(JSON.stringify({ error: eventsResult.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Event sent successfully:", eventsResult);

    // Update lead with purchase info
    await supabaseClient
      .from("ads_whatsapp_leads")
      .update({
        purchase_sent_at: new Date().toISOString(),
        purchase_value: value,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        events_received: eventsResult.events_received,
        fbtrace_id: eventsResult.fbtrace_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Facebook Conversions error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
