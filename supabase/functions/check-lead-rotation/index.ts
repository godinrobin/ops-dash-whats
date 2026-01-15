import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// São Paulo timezone offset: -03:00
const getSaoPauloDate = (): string => {
  const now = new Date();
  // Convert to São Paulo time (UTC-3)
  const saoPauloOffset = -3 * 60; // -3 hours in minutes
  const utcOffset = now.getTimezoneOffset();
  const saoPauloTime = new Date(now.getTime() + (utcOffset + saoPauloOffset) * 60000);
  return saoPauloTime.toISOString().split('T')[0]; // YYYY-MM-DD
};

interface LeadRotationRequest {
  user_id: string;
  instance_id: string;
  instance_name?: string;
  phone_number?: string;
}

/**
 * Send push notification directly to OneSignal
 */
async function sendPushNotification(
  subscriptionIds: string[],
  title: string,
  message: string,
  iconUrl: string = "https://zapdata.com.br/favicon.png"
): Promise<{ success: boolean; error?: string }> {
  const oneSignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
  const oneSignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

  if (!oneSignalAppId || !oneSignalApiKey) {
    console.error("[CHECK-LEAD-ROTATION] OneSignal credentials not configured");
    return { success: false, error: "OneSignal not configured" };
  }

  if (!subscriptionIds || subscriptionIds.length === 0) {
    console.log("[CHECK-LEAD-ROTATION] No subscription IDs to send to");
    return { success: false, error: "No subscription IDs" };
  }

  try {
    const payload = {
      app_id: oneSignalAppId,
      include_subscription_ids: subscriptionIds,
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      chrome_web_icon: iconUrl,
      firefox_icon: iconUrl,
    };

    console.log(`[CHECK-LEAD-ROTATION] Sending push to ${subscriptionIds.length} devices: ${title}`);

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${oneSignalApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[CHECK-LEAD-ROTATION] OneSignal error:", result);
      return { success: false, error: JSON.stringify(result) };
    }

    console.log("[CHECK-LEAD-ROTATION] OneSignal success:", result);
    return { success: true };
  } catch (error) {
    console.error("[CHECK-LEAD-ROTATION] Error sending push:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: LeadRotationRequest = await req.json();
    const { user_id, instance_id, instance_name, phone_number } = body;

    if (!user_id || !instance_id) {
      return new Response(
        JSON.stringify({ error: "user_id and instance_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CHECK-LEAD-ROTATION] Checking for user ${user_id}, instance ${instance_id}`);

    // 1. Get user's profile settings
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("notify_on_lead_rotation, lead_rotation_limit, push_webhook_enabled, push_subscription_ids")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      console.log("[CHECK-LEAD-ROTATION] Profile not found or error:", profileError);
      return new Response(
        JSON.stringify({ message: "Profile not found", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if notification is enabled
    if (!profile.notify_on_lead_rotation || !profile.push_webhook_enabled) {
      console.log("[CHECK-LEAD-ROTATION] Notifications not enabled");
      return new Response(
        JSON.stringify({ message: "Notifications not enabled", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const limit = profile.lead_rotation_limit || 30;
    const subscriptionIds = profile.push_subscription_ids || [];

    if (subscriptionIds.length === 0) {
      console.log("[CHECK-LEAD-ROTATION] No subscription IDs configured");
      return new Response(
        JSON.stringify({ message: "No subscription IDs", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = getSaoPauloDate();
    console.log(`[CHECK-LEAD-ROTATION] Today (São Paulo): ${today}, Limit: ${limit}`);

    // 2. Get or create today's count for this instance
    const { data: existingCount, error: countError } = await supabase
      .from("lead_rotation_daily_counts")
      .select("*")
      .eq("user_id", user_id)
      .eq("instance_id", instance_id)
      .eq("date", today)
      .maybeSingle();

    let currentCount = 0;
    let notificationAlreadySent = false;

    if (existingCount) {
      currentCount = existingCount.lead_count + 1;
      notificationAlreadySent = existingCount.notification_sent;
      
      // Update the count
      await supabase
        .from("lead_rotation_daily_counts")
        .update({ 
          lead_count: currentCount, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", existingCount.id);
    } else {
      // Create new record for today
      currentCount = 1;
      await supabase
        .from("lead_rotation_daily_counts")
        .insert({
          user_id,
          instance_id,
          date: today,
          lead_count: 1,
          notification_sent: false,
        });
    }

    console.log(`[CHECK-LEAD-ROTATION] Current count: ${currentCount}, Limit: ${limit}, Already notified: ${notificationAlreadySent}`);

    // 3. Check if we hit the limit and notification not already sent
    if (currentCount >= limit && !notificationAlreadySent) {
      console.log(`[CHECK-LEAD-ROTATION] Limit reached! Sending notification DIRECTLY to OneSignal...`);

      // Mark as notified FIRST (to prevent duplicate sends)
      await supabase
        .from("lead_rotation_daily_counts")
        .update({ notification_sent: true })
        .eq("user_id", user_id)
        .eq("instance_id", instance_id)
        .eq("date", today);

      // Get instance details for the notification
      const instanceDisplay = instance_name || phone_number || instance_id.slice(0, 8);

      // SEND DIRECTLY TO ONESIGNAL (no queue, instant delivery)
      const pushResult = await sendPushNotification(
        subscriptionIds,
        "🔄 Rotação de Leads",
        `A instância ${instanceDisplay} atingiu o limite de ${limit} leads hoje! (${currentCount} leads)`,
        "https://zapdata.com.br/favicon.png"
      );

      if (!pushResult.success) {
        console.error("[CHECK-LEAD-ROTATION] Failed to send push notification:", pushResult.error);
        // Still return success since we marked as notified to prevent spam
      }

      console.log(`[CHECK-LEAD-ROTATION] Push notification sent: ${pushResult.success}`);
      
      return new Response(
        JSON.stringify({ 
          message: "Limit reached, notification sent",
          currentCount,
          limit,
          instanceDisplay,
          pushSent: pushResult.success,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: "Count updated",
        currentCount,
        limit,
        notificationSent: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[CHECK-LEAD-ROTATION] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});