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

    // Use atomic RPC to claim notifications (prevents race conditions with row-level locks)
    const { data: claimedNotifications, error: claimError } = await supabase
      .rpc('claim_push_notifications', { batch_size: 50 });

    if (claimError) {
      console.error("Error claiming notifications:", claimError);
      throw claimError;
    }

    if (!claimedNotifications || claimedNotifications.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending notifications", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${claimedNotifications.length} notifications (atomically claimed)`);

    let successCount = 0;
    let failCount = 0;

    for (const notification of claimedNotifications) {
      try {
        const subscriptionIds = notification.subscription_ids;
        
        if (!subscriptionIds || subscriptionIds.length === 0) {
          console.log(`Notification ${notification.id} has no subscription IDs, skipping`);
          continue;
        }

        // Send push notification via OneSignal - simple payload only
        const oneSignalPayload: Record<string, unknown> = {
          app_id: oneSignalAppId,
          include_subscription_ids: subscriptionIds,
          headings: { en: notification.title },
          contents: { en: notification.message },
          chrome_web_icon: notification.icon_url || "https://zapdata.com.br/favicon.png",
          firefox_icon: notification.icon_url || "https://zapdata.com.br/favicon.png",
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

      } catch (notifError) {
        console.error(`Error processing notification ${notification.id}:`, notifError);
        failCount++;
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Queue processed",
        total: claimedNotifications.length,
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
