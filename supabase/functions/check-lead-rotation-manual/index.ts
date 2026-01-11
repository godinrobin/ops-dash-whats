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

interface ManualCheckRequest {
  user_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ManualCheckRequest = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CHECK-LEAD-ROTATION-MANUAL] Manual check for user ${user_id}`);

    // 1. Get user's profile settings
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("notify_on_lead_rotation, lead_rotation_limit, push_webhook_enabled, push_subscription_ids")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      console.log("[CHECK-LEAD-ROTATION-MANUAL] Profile not found or error:", profileError);
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if push is enabled
    if (!profile.push_webhook_enabled) {
      return new Response(
        JSON.stringify({ error: "Notificações push não estão habilitadas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const limit = profile.lead_rotation_limit || 30;
    const subscriptionIds = profile.push_subscription_ids || [];

    if (subscriptionIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum token de dispositivo cadastrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = getSaoPauloDate();
    console.log(`[CHECK-LEAD-ROTATION-MANUAL] Today (São Paulo): ${today}, Limit: ${limit}`);

    // 2. Get all instances for this user
    const { data: instances, error: instancesError } = await supabase
      .from("maturador_instances")
      .select("id, instance_name, phone_number, label")
      .eq("user_id", user_id);

    if (instancesError || !instances || instances.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma instância encontrada", checked: 0, notified: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CHECK-LEAD-ROTATION-MANUAL] Found ${instances.length} instances`);

    // 3. Get today's counts for all user instances
    const { data: todayCounts, error: countsError } = await supabase
      .from("lead_rotation_daily_counts")
      .select("*")
      .eq("user_id", user_id)
      .eq("date", today);

    if (countsError) {
      console.error("[CHECK-LEAD-ROTATION-MANUAL] Error fetching counts:", countsError);
    }

    const countsMap = new Map(
      (todayCounts || []).map(c => [c.instance_id, c])
    );

    let notificationsQueued = 0;
    const instancesAboveLimit: string[] = [];

    // 4. Check each instance
    for (const instance of instances) {
      const count = countsMap.get(instance.id);
      const currentCount = count?.lead_count || 0;
      const alreadyNotified = count?.notification_sent || false;

      console.log(`[CHECK-LEAD-ROTATION-MANUAL] Instance ${instance.instance_name}: count=${currentCount}, limit=${limit}, notified=${alreadyNotified}`);

      // If at or above limit and not already notified today
      if (currentCount >= limit && !alreadyNotified) {
        const instanceDisplay = instance.label || instance.phone_number || instance.instance_name;
        instancesAboveLimit.push(instanceDisplay);

        // Mark as notified
        if (count) {
          await supabase
            .from("lead_rotation_daily_counts")
            .update({ notification_sent: true })
            .eq("id", count.id);
        } else {
          // Create record if doesn't exist (edge case)
          await supabase
            .from("lead_rotation_daily_counts")
            .insert({
              user_id,
              instance_id: instance.id,
              date: today,
              lead_count: currentCount,
              notification_sent: true,
            });
        }

        // Queue push notification
        await supabase
          .from("push_notification_queue")
          .insert({
            user_id,
            subscription_ids: subscriptionIds,
            title: "🔄 Rotação de Leads",
            message: `A instância ${instanceDisplay} atingiu o limite de ${limit} leads hoje!`,
            icon_url: "https://zapdata.com.br/favicon.png",
            priority: 10,
          });

        notificationsQueued++;
      }
    }

    const message = notificationsQueued > 0 
      ? `${notificationsQueued} instância(s) acima do limite! Notificações enviadas.`
      : "Nenhuma instância atingiu o limite ainda hoje.";

    console.log(`[CHECK-LEAD-ROTATION-MANUAL] Done. Notified: ${notificationsQueued}`);

    return new Response(
      JSON.stringify({ 
        message,
        checked: instances.length,
        notified: notificationsQueued,
        instancesAboveLimit,
        limit,
        date: today,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[CHECK-LEAD-ROTATION-MANUAL] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
