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
    const { instance_id, instance_name, phone_number, user_id } = await req.json();
    
    console.log("[DISCONNECT-NOTIFY] Received:", { instance_id, instance_name, phone_number, user_id });

    if (!user_id) {
      console.log("[DISCONNECT-NOTIFY] Missing user_id");
      return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the user's notification config
    const { data: config, error: configError } = await supabase
      .from("admin_notify_configs")
      .select("*")
      .eq("user_id", user_id)
      .eq("status_monitor_enabled", true)
      .maybeSingle();

    if (configError) {
      console.error("[DISCONNECT-NOTIFY] Config error:", configError);
      return new Response(JSON.stringify({ success: false, error: configError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!config || !config.notifier_instance_id || !config.admin_instance_ids?.length) {
      console.log("[DISCONNECT-NOTIFY] No valid config found or monitoring disabled");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "No config or monitoring disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get notifier instance
    const { data: notifier, error: notifierError } = await supabase
      .from("maturador_instances")
      .select("instance_name, uazapi_token")
      .eq("id", config.notifier_instance_id)
      .maybeSingle();

    if (notifierError || !notifier?.uazapi_token) {
      console.error("[DISCONNECT-NOTIFY] Notifier error:", notifierError);
      return new Response(JSON.stringify({ success: false, error: "Notifier not found or no token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin instances
    const { data: admins, error: adminsError } = await supabase
      .from("maturador_instances")
      .select("phone_number, instance_name")
      .in("id", config.admin_instance_ids);

    if (adminsError) {
      console.error("[DISCONNECT-NOTIFY] Admins error:", adminsError);
      return new Response(JSON.stringify({ success: false, error: adminsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const displayNumber = phone_number || instance_name || "Número desconhecido";
    const message = `🚨 Número Caiu: ${displayNumber}\n\n\`\`\`aviso zapdata\`\`\``;

    let sentCount = 0;
    const errors: string[] = [];

    for (const admin of admins || []) {
      const adminPhone = admin.phone_number || admin.instance_name;
      if (!adminPhone) continue;

      const adminPhoneDigits = adminPhone.replace(/\D/g, "");
      if (!adminPhoneDigits) continue;

      try {
        console.log(`[DISCONNECT-NOTIFY] Sending to ${adminPhoneDigits} via ${notifier.instance_name}`);
        
        // UazAPI v2 uses /send/text with 'token' header
        const uazapiBaseUrl = `https://api.uazapi.com/${notifier.instance_name}`;
        const response = await fetch(
          `${uazapiBaseUrl}/send/text`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "token": notifier.uazapi_token,
            },
            body: JSON.stringify({
              number: adminPhoneDigits,
              text: message,
            }),
          }
        );

        const result = await response.text();
        console.log(`[DISCONNECT-NOTIFY] Response for ${adminPhoneDigits}:`, response.status, result);

        if (response.ok) {
          sentCount++;
        } else {
          errors.push(`${adminPhoneDigits}: ${response.status} - ${result}`);
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[DISCONNECT-NOTIFY] Error sending to ${adminPhoneDigits}:`, err);
        errors.push(`${adminPhoneDigits}: ${errorMessage}`);
      }
    }

    console.log(`[DISCONNECT-NOTIFY] Completed. Sent: ${sentCount}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        errors: errors.length > 0 ? errors : undefined 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[DISCONNECT-NOTIFY] Unhandled error:", err);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
