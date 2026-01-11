import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const oneSignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const oneSignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

    if (!oneSignalAppId || !oneSignalApiKey) {
      console.error("OneSignal credentials not configured");
      return new Response(
        JSON.stringify({ error: "OneSignal not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get unprocessed notifications from queue
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("push_notification_queue")
      .select("*")
      .eq("processed", false)
      .order("created_at", { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error("Error fetching queue:", fetchError);
      throw fetchError;
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending notifications", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${pendingNotifications.length} notifications`);

    let successCount = 0;
    let failCount = 0;

    for (const notification of pendingNotifications) {
      try {
        const subscriptionIds = notification.subscription_ids;
        
        if (!subscriptionIds || subscriptionIds.length === 0) {
          console.log(`Notification ${notification.id} has no subscription IDs, marking as processed`);
          await supabase
            .from("push_notification_queue")
            .update({ processed: true })
            .eq("id", notification.id);
          continue;
        }

        // Determine if this is a high priority notification
        const isHighPriority = notification.priority >= 10;

        // Send push notification via OneSignal
        // Note: For web push, priority options are limited compared to mobile
        const oneSignalPayload: Record<string, unknown> = {
          app_id: oneSignalAppId,
          include_subscription_ids: subscriptionIds,
          headings: { en: notification.title },
          contents: { en: notification.message },
          chrome_web_icon: notification.icon_url || "https://zapdata.com.br/favicon.png",
          firefox_icon: notification.icon_url || "https://zapdata.com.br/favicon.png",
          // Priority: 10 = high priority (wake device), 5 = normal
          priority: isHighPriority ? 10 : 5,
          // TTL - time to live in seconds
          ttl: isHighPriority ? 300 : 86400, // 5 minutes for urgent, 24 hours for normal
          // Require user interaction for important notifications (keeps notification visible)
          require_interaction: isHighPriority,
        };

        console.log(`Sending notification to ${subscriptionIds.length} devices:`, notification.title);

        const oneSignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${oneSignalApiKey}`,
          },
          body: JSON.stringify(oneSignalPayload),
        });

        const oneSignalResult = await oneSignalResponse.json();

        if (!oneSignalResponse.ok) {
          console.error(`OneSignal error for notification ${notification.id}:`, oneSignalResult);
          failCount++;
        } else {
          console.log(`Successfully sent notification ${notification.id}:`, oneSignalResult);
          successCount++;
        }

        // Mark as processed regardless of success/failure to avoid retry loops
        await supabase
          .from("push_notification_queue")
          .update({ processed: true })
          .eq("id", notification.id);

      } catch (notifError) {
        console.error(`Error processing notification ${notification.id}:`, notifError);
        failCount++;
        
        // Mark as processed to avoid infinite retry
        await supabase
          .from("push_notification_queue")
          .update({ processed: true })
          .eq("id", notification.id);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Queue processed",
        total: pendingNotifications.length,
        success: successCount,
        failed: failCount
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error processing push queue:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
