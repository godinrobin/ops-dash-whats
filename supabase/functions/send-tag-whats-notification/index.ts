import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sale notification variations
const SALE_NOTIFICATIONS = {
  nova_venda: "🔥 Nova venda",
  pix_recebido: "💸 Pix recebido",
  pingou: "🤑 Pingou",
  pix_x1: "💵 Pix do x1",
  venda_confirmada: "🔔 Venda confirmada",
  dinheiro_conta: "💰 Dinheiro na conta",
  venda_x1: "🚀 Venda no x1",
  pix_bolso: "💸 Pix no bolso",
  pix_confirmado: "💵 Pix confirmado",
  venda_paga: "⚡ Venda paga",
  venda_aprovada: "📲 Venda aprovada",
};

// Fun notifications for milestones
const FUN_NOTIFICATIONS = {
  10: [
    "🚀 Escala começando boaaa!",
    "🔥 10 vendas já? Dá pra sentir o cheiro do lucro",
    "⚡ Hoje promete…",
    "💸 10 pingos já molharam o caixa",
    "🤑 O caixa acordou cedo hoje",
  ],
  20: [
    "😈 Sua mãe deve tá orgulhosa!",
    "🤑 20 vendas… alguém tá trabalhando",
    "🚀 Tá ficando sério",
    "🤑 Caixa começando a sorrir",
    "😈 Não é sorte, é método",
    "🥹 Orgulho da família confirmado",
  ],
  50: [
    "🤯 Rei do x1 +50 pix no dia!!",
    "🤯 50 pix no dia? Calma, tubarão",
    "🔥 Hoje você acordou diferente",
    "💸 Pix caindo igual chuva",
  ],
  100: [
    "🥹 Vende mentoria pra mim?",
    "👑 Isso aqui já virou aula",
    "🤯 100 vendas… tá explicado",
  ],
};

interface NotificationRequest {
  user_id: string;
  type: "sale" | "test" | "fun";
  milestone?: number;
  custom_message?: string;
}

serve(async (req) => {
  console.log("[NOTIFICATION] ====== FUNCTION STARTED ======");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const oneSignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
  const oneSignalRestApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

  if (!oneSignalAppId || !oneSignalRestApiKey) {
    console.error("[NOTIFICATION] OneSignal credentials not configured");
    return new Response(JSON.stringify({ success: false, error: "OneSignal not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: NotificationRequest = await req.json();
    console.log("[NOTIFICATION] Request body:", body);

    const { user_id, type, milestone, custom_message } = body;

    // Get user's notification preferences
    const { data: preferences, error: prefError } = await supabase
      .from("tag_whats_notification_preferences")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_enabled", true);

    if (prefError) {
      console.error("[NOTIFICATION] Error fetching preferences:", prefError);
      return new Response(JSON.stringify({ success: false, error: "Failed to fetch preferences" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!preferences || preferences.length === 0) {
      console.log("[NOTIFICATION] No active notification preferences for user");
      return new Response(JSON.stringify({ success: true, message: "No active preferences" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all player IDs for this user
    const playerIds = preferences
      .filter((p: any) => p.onesignal_player_id)
      .map((p: any) => p.onesignal_player_id);

    if (playerIds.length === 0) {
      console.log("[NOTIFICATION] No player IDs found for user");
      return new Response(JSON.stringify({ success: true, message: "No player IDs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let notificationContent = "";
    let notificationType = "sale";

    if (type === "test") {
      notificationContent = custom_message || "🔔 Teste de notificação - Tag Whats Cloud";
    } else if (type === "fun" && milestone) {
      // Fun notification for milestones
      const firstPref = preferences[0];
      if (!firstPref.fun_notifications_enabled) {
        console.log("[NOTIFICATION] Fun notifications disabled for user");
        return new Response(JSON.stringify({ success: true, message: "Fun notifications disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const funMessages = FUN_NOTIFICATIONS[milestone as keyof typeof FUN_NOTIFICATIONS];
      if (!funMessages) {
        return new Response(JSON.stringify({ success: false, error: "Invalid milestone" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get rotation index for this milestone
      const rotationType = `fun_${milestone}`;
      const { data: rotation } = await supabase
        .from("tag_whats_notification_rotation")
        .select("current_index")
        .eq("user_id", user_id)
        .eq("notification_type", rotationType)
        .single();

      const currentIndex = rotation?.current_index || 0;
      notificationContent = funMessages[currentIndex % funMessages.length];

      // Update rotation index
      await supabase
        .from("tag_whats_notification_rotation")
        .upsert({
          user_id,
          notification_type: rotationType,
          current_index: (currentIndex + 1) % funMessages.length,
        }, { onConflict: "user_id,notification_type" });

      notificationType = `fun_${milestone}`;
    } else {
      // Regular sale notification
      const firstPref = preferences[0];
      
      // Get enabled notification types
      const enabledTypes: string[] = [];
      Object.keys(SALE_NOTIFICATIONS).forEach((key) => {
        if (firstPref[key] === true) {
          enabledTypes.push(key);
        }
      });

      if (enabledTypes.length === 0) {
        console.log("[NOTIFICATION] No notification types enabled");
        return new Response(JSON.stringify({ success: true, message: "No types enabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get rotation index for sales
      const { data: rotation } = await supabase
        .from("tag_whats_notification_rotation")
        .select("current_index")
        .eq("user_id", user_id)
        .eq("notification_type", "sale")
        .single();

      const currentIndex = rotation?.current_index || 0;
      const selectedType = enabledTypes[currentIndex % enabledTypes.length];
      notificationContent = SALE_NOTIFICATIONS[selectedType as keyof typeof SALE_NOTIFICATIONS];

      // Update rotation index
      await supabase
        .from("tag_whats_notification_rotation")
        .upsert({
          user_id,
          notification_type: "sale",
          current_index: (currentIndex + 1) % enabledTypes.length,
        }, { onConflict: "user_id,notification_type" });
    }

    console.log("[NOTIFICATION] Sending notification:", notificationContent);
    console.log("[NOTIFICATION] To player IDs:", playerIds);

    // Get custom sound URL from first preference
    const customSoundUrl = preferences[0]?.custom_sound_url;

    // Send notification via OneSignal
    const notificationPayload: any = {
      app_id: oneSignalAppId,
      include_player_ids: playerIds,
      contents: { en: notificationContent },
      headings: { en: "Tag Whats Cloud" },
    };

    // Add custom sound if configured
    if (customSoundUrl) {
      notificationPayload.ios_sound = customSoundUrl;
      notificationPayload.android_sound = customSoundUrl;
    }

    const oneSignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${oneSignalRestApiKey}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    const oneSignalResult = await oneSignalResponse.json();
    console.log("[NOTIFICATION] OneSignal response:", oneSignalResult);

    if (oneSignalResult.errors) {
      console.error("[NOTIFICATION] OneSignal errors:", oneSignalResult.errors);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "OneSignal error", 
        details: oneSignalResult.errors 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      notification_id: oneSignalResult.id,
      message: notificationContent,
      recipients: oneSignalResult.recipients 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[NOTIFICATION] Error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
