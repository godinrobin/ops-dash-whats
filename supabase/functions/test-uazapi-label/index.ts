import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { instanceName, phone } = await req.json();
    
    console.log("[TEST-LABEL] Starting test for:", { instanceName, phone });

    // Get instance
    const { data: instance, error: instanceError } = await supabase
      .from("maturador_instances")
      .select("id, user_id, uazapi_token, instance_name")
      .eq("instance_name", instanceName)
      .single();

    if (instanceError || !instance) {
      return new Response(JSON.stringify({ error: "Instance not found", instanceError }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[TEST-LABEL] Instance found:", instance.id);

    const uazapiToken = instance.uazapi_token;
    const uazapiBaseUrl = "https://zapdata.uazapi.com";

    // Step 1: Get all labels
    console.log("[TEST-LABEL] Fetching labels...");
    const labelsResponse = await fetch(`${uazapiBaseUrl}/labels`, {
      method: "GET",
      headers: { "token": uazapiToken },
    });

    const labelsText = await labelsResponse.text();
    console.log("[TEST-LABEL] Labels response status:", labelsResponse.status);
    console.log("[TEST-LABEL] Labels response:", labelsText);

    let labels = [];
    let pagoLabel = null;
    try {
      labels = JSON.parse(labelsText);
      pagoLabel = labels.find((l: any) => 
        l.name?.toLowerCase() === "pago"
      );
    } catch (e) {
      console.log("[TEST-LABEL] Failed to parse labels");
    }

    console.log("[TEST-LABEL] Pago label found:", pagoLabel);

    if (!pagoLabel) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Label 'Pago' not found",
        availableLabels: labels.map((l: any) => ({ id: l.labelid || l.id, name: l.name }))
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pagoLabelId = pagoLabel.labelid || pagoLabel.id;
    console.log("[TEST-LABEL] Pago label ID:", pagoLabelId);

    // Step 2: Apply label to chat
    console.log("[TEST-LABEL] Applying label to phone:", phone);
    const labelPayload = {
      number: phone,
      add_labelid: pagoLabelId,
    };
    console.log("[TEST-LABEL] Label payload:", JSON.stringify(labelPayload));

    const applyResponse = await fetch(`${uazapiBaseUrl}/chat/labels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": uazapiToken,
      },
      body: JSON.stringify(labelPayload),
    });

    const applyText = await applyResponse.text();
    console.log("[TEST-LABEL] Apply label response status:", applyResponse.status);
    console.log("[TEST-LABEL] Apply label response:", applyText);

    return new Response(JSON.stringify({
      success: applyResponse.ok,
      labelsFound: labels.length,
      pagoLabel: pagoLabel,
      pagoLabelId: pagoLabelId,
      applyStatus: applyResponse.status,
      applyResponse: applyText,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[TEST-LABEL] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
