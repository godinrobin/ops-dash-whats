import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // 2. Get real lead counts from inbox_contacts for today (São Paulo timezone)
    // Query directly from inbox_contacts grouped by instance_id
    const { data: leadCounts, error: countsError } = await supabase.rpc('get_daily_leads_by_instance', {
      p_user_id: user_id
    });

    // If RPC doesn't exist, query directly
    let instanceLeadCounts: Array<{ instance_id: string; lead_count: number; instance_name: string; phone_number: string }> = [];
    
    if (countsError) {
      console.log("[CHECK-LEAD-ROTATION-MANUAL] RPC not available, querying directly");
      
      // Get today's leads count per instance from inbox_contacts
      const { data: contacts, error: contactsError } = await supabase
        .from("inbox_contacts")
        .select("instance_id, created_at")
        .eq("user_id", user_id)
        .not("instance_id", "is", null);

      if (contactsError) {
        console.error("[CHECK-LEAD-ROTATION-MANUAL] Error fetching contacts:", contactsError);
        return new Response(
          JSON.stringify({ error: "Erro ao buscar contatos" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get today's date in São Paulo timezone
      const now = new Date();
      const saoPauloOffset = -3 * 60; // -3 hours in minutes
      const utcOffset = now.getTimezoneOffset();
      const saoPauloTime = new Date(now.getTime() + (utcOffset + saoPauloOffset) * 60000);
      const today = saoPauloTime.toISOString().split('T')[0];

      console.log(`[CHECK-LEAD-ROTATION-MANUAL] Today (São Paulo): ${today}, Limit: ${limit}`);

      // Filter contacts created today and count by instance
      const instanceCountMap = new Map<string, number>();
      
      for (const contact of contacts || []) {
        if (!contact.instance_id) continue;
        
        // Convert contact's created_at to São Paulo date
        const contactDate = new Date(contact.created_at);
        const contactSaoPauloTime = new Date(contactDate.getTime() + (contactDate.getTimezoneOffset() + saoPauloOffset) * 60000);
        const contactDateStr = contactSaoPauloTime.toISOString().split('T')[0];
        
        if (contactDateStr === today) {
          const currentCount = instanceCountMap.get(contact.instance_id) || 0;
          instanceCountMap.set(contact.instance_id, currentCount + 1);
        }
      }

      // Get instance details
      const instanceIds = Array.from(instanceCountMap.keys());
      
      if (instanceIds.length > 0) {
        const { data: instances } = await supabase
          .from("maturador_instances")
          .select("id, instance_name, phone_number, label")
          .in("id", instanceIds);

        for (const [instanceId, count] of instanceCountMap.entries()) {
          const instance = instances?.find(i => i.id === instanceId);
          instanceLeadCounts.push({
            instance_id: instanceId,
            lead_count: count,
            instance_name: instance?.label || instance?.phone_number || instance?.instance_name || instanceId.slice(0, 8),
            phone_number: instance?.phone_number || ''
          });
        }
      }
    } else {
      instanceLeadCounts = leadCounts || [];
    }

    console.log(`[CHECK-LEAD-ROTATION-MANUAL] Found ${instanceLeadCounts.length} instances with leads today`);

    // 3. Get today's notification status from lead_rotation_daily_counts
    const now = new Date();
    const saoPauloOffset = -3 * 60;
    const utcOffset = now.getTimezoneOffset();
    const saoPauloTime = new Date(now.getTime() + (utcOffset + saoPauloOffset) * 60000);
    const today = saoPauloTime.toISOString().split('T')[0];

    const { data: notificationStatuses } = await supabase
      .from("lead_rotation_daily_counts")
      .select("instance_id, notification_sent")
      .eq("user_id", user_id)
      .eq("date", today);

    const notifiedMap = new Map(
      (notificationStatuses || []).map(s => [s.instance_id, s.notification_sent])
    );

    let notificationsQueued = 0;
    const instancesAboveLimit: string[] = [];

    // 4. Check each instance with leads
    for (const instance of instanceLeadCounts) {
      const currentCount = instance.lead_count;
      const alreadyNotified = notifiedMap.get(instance.instance_id) || false;

      console.log(`[CHECK-LEAD-ROTATION-MANUAL] Instance ${instance.instance_name}: count=${currentCount}, limit=${limit}, notified=${alreadyNotified}`);

      // If at or above limit and not already notified today
      if (currentCount >= limit && !alreadyNotified) {
        const instanceDisplay = instance.instance_name || instance.phone_number || instance.instance_id.slice(0, 8);
        instancesAboveLimit.push(instanceDisplay);

        // Upsert notification status
        const { error: upsertError } = await supabase
          .from("lead_rotation_daily_counts")
          .upsert({
            user_id,
            instance_id: instance.instance_id,
            date: today,
            lead_count: currentCount,
            notification_sent: true,
          }, {
            onConflict: 'user_id,instance_id,date'
          });

        if (upsertError) {
          console.error("[CHECK-LEAD-ROTATION-MANUAL] Error upserting notification status:", upsertError);
          // Try insert/update separately
          const { data: existing } = await supabase
            .from("lead_rotation_daily_counts")
            .select("id")
            .eq("user_id", user_id)
            .eq("instance_id", instance.instance_id)
            .eq("date", today)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("lead_rotation_daily_counts")
              .update({ notification_sent: true, lead_count: currentCount })
              .eq("id", existing.id);
          } else {
            await supabase
              .from("lead_rotation_daily_counts")
              .insert({
                user_id,
                instance_id: instance.instance_id,
                date: today,
                lead_count: currentCount,
                notification_sent: true,
              });
          }
        }

        // Queue push notification
        await supabase
          .from("push_notification_queue")
          .insert({
            user_id,
            subscription_ids: subscriptionIds,
            title: "🔄 Rotação de Leads",
            message: `A instância ${instanceDisplay} atingiu o limite de ${limit} leads hoje! (${currentCount} leads)`,
            icon_url: "https://zapdata.com.br/favicon.png",
            priority: 10,
          });

        notificationsQueued++;
      }
    }

    const message = notificationsQueued > 0 
      ? `${notificationsQueued} instância(s) acima do limite! Notificações enviadas.`
      : instanceLeadCounts.length > 0 
        ? `Nenhuma instância atingiu o limite de ${limit} leads ainda hoje.`
        : "Nenhum lead registrado hoje.";

    console.log(`[CHECK-LEAD-ROTATION-MANUAL] Done. Notified: ${notificationsQueued}`);

    return new Response(
      JSON.stringify({ 
        message,
        checked: instanceLeadCounts.length,
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
