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

    const { saleLogId, value } = await req.json();
    console.log("[MANUAL-CONVERSION] Starting manual conversion for saleLogId:", saleLogId, "value:", value);

    if (!saleLogId) {
      return new Response(JSON.stringify({ error: "saleLogId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the sale log
    const { data: saleLog, error: saleLogError } = await supabaseClient
      .from("tag_whats_logs")
      .select("*")
      .eq("id", saleLogId)
      .eq("user_id", user.id)
      .single();

    if (saleLogError || !saleLog) {
      console.error("[MANUAL-CONVERSION] Sale log not found:", saleLogError);
      return new Response(JSON.stringify({ error: "Sale log not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (saleLog.conversion_sent) {
      return new Response(JSON.stringify({ error: "Conversion already sent" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the config for this instance to find the ad account
    const { data: config, error: configError } = await supabaseClient
      .from("tag_whats_configs")
      .select("*")
      .eq("instance_id", saleLog.instance_id)
      .eq("user_id", user.id)
      .single();

    if (configError || !config) {
      console.error("[MANUAL-CONVERSION] Config not found:", configError);
      return new Response(JSON.stringify({ error: "Config not found for this instance" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the ad account ID (support both old and new formats)
    const adAccountId = (config.selected_ad_account_ids && config.selected_ad_account_ids.length > 0)
      ? config.selected_ad_account_ids[0]
      : config.ad_account_id;

    if (!adAccountId) {
      console.error("[MANUAL-CONVERSION] No ad account configured");
      return new Response(JSON.stringify({ error: "Nenhuma conta de anúncios configurada para esta instância" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the ad account with access token
    const { data: adAccount, error: adAccountError } = await supabaseClient
      .from("ads_ad_accounts")
      .select("*, ads_facebook_accounts(*)")
      .eq("id", adAccountId)
      .eq("user_id", user.id)
      .single();

    if (adAccountError || !adAccount) {
      console.error("[MANUAL-CONVERSION] Ad account not found:", adAccountError);
      return new Response(JSON.stringify({ error: "Conta de anúncios não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = adAccount.ads_facebook_accounts?.access_token;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Token de acesso não encontrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the selected pixel for this ad account
    const { data: selectedPixel } = await supabaseClient
      .from("ads_pixels")
      .select("pixel_id, name")
      .eq("ad_account_id", adAccountId)
      .eq("is_selected", true)
      .maybeSingle();

    let pixelId: string;

    if (selectedPixel) {
      pixelId = selectedPixel.pixel_id;
      console.log("[MANUAL-CONVERSION] Using selected pixel:", pixelId);
    } else {
      // Fallback: Get pixel ID from Facebook API
      const pixelUrl = `https://graph.facebook.com/v21.0/act_${adAccount.ad_account_id}/adspixels?fields=id,name&access_token=${accessToken}`;
      const pixelResponse = await fetch(pixelUrl);
      const pixelData = await pixelResponse.json();

      if (pixelData.error || !pixelData.data || pixelData.data.length === 0) {
        console.error("[MANUAL-CONVERSION] No pixel found:", pixelData.error);
        return new Response(JSON.stringify({ error: "Nenhum pixel encontrado. Configure um pixel na conta de anúncios." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      pixelId = pixelData.data[0].id;
      console.log("[MANUAL-CONVERSION] Using first pixel from Facebook:", pixelId);
    }

    // Hash the phone number for privacy
    const hashedPhone = await hashData(saleLog.contact_phone);

    // Get ctwa_clid if available from the sale log
    const ctwaClid = saleLog.ctwa_clid || null;

    // Use the provided value or fallback to extracted value
    const purchaseValue = value ?? saleLog.extracted_value ?? 0;

    // Prepare event data
    const eventData = {
      event_name: "Purchase",
      event_time: Math.floor(new Date(saleLog.created_at).getTime() / 1000),
      action_source: "website",
      user_data: {
        ph: [hashedPhone],
        client_user_agent: req.headers.get("user-agent") || "",
        fbp: ctwaClid || undefined,
      },
      custom_data: {
        currency: "BRL",
        value: purchaseValue,
      },
    };

    console.log("[MANUAL-CONVERSION] Sending event to pixel:", pixelId, eventData);

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
      console.error("[MANUAL-CONVERSION] Conversions API error:", eventsResult.error);
      
      // Update the sale log with the error
      await supabaseClient
        .from("tag_whats_logs")
        .update({
          conversion_error: eventsResult.error.message,
        })
        .eq("id", saleLogId);

      return new Response(JSON.stringify({ error: eventsResult.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[MANUAL-CONVERSION] Event sent successfully:", eventsResult);

    // Update the sale log
    await supabaseClient
      .from("tag_whats_logs")
      .update({
        conversion_sent: true,
        conversion_error: null,
        extracted_value: purchaseValue,
      })
      .eq("id", saleLogId);

    return new Response(
      JSON.stringify({
        success: true,
        events_received: eventsResult.events_received,
        fbtrace_id: eventsResult.fbtrace_id,
        pixel_id: pixelId,
        value: purchaseValue,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[MANUAL-CONVERSION] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
