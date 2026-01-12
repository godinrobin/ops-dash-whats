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
    const { instanceName, phone, createIfMissing = true } = await req.json();
    
    console.log("[TEST-LABEL] Starting test for:", { instanceName, phone, createIfMissing });

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
      if (Array.isArray(labels)) {
        pagoLabel = labels.find((l: any) => 
          l.name?.toLowerCase() === "pago"
        );
      }
    } catch (e) {
      console.log("[TEST-LABEL] Failed to parse labels:", e);
    }

    console.log("[TEST-LABEL] All labels:", labels);
    console.log("[TEST-LABEL] Pago label found:", pagoLabel);

    // Step 2: If no Pago label and createIfMissing is true, try to create it
    let createdLabel = null;
    if (!pagoLabel && createIfMissing) {
      console.log("[TEST-LABEL] Attempting to create 'Pago' label...");
      
      const createResponse = await fetch(`${uazapiBaseUrl}/label/edit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "token": uazapiToken,
        },
        body: JSON.stringify({
          name: "Pago",
          color: 6, // Green color
        }),
      });

      const createText = await createResponse.text();
      console.log("[TEST-LABEL] Create label response status:", createResponse.status);
      console.log("[TEST-LABEL] Create label response:", createText);
      createdLabel = { status: createResponse.status, response: createText };

      if (createResponse.ok) {
        // Wait for sync and fetch again
        await new Promise(resolve => setTimeout(resolve, 2000));

        const refetchResponse = await fetch(`${uazapiBaseUrl}/labels`, {
          method: "GET",
          headers: { "token": uazapiToken },
        });

        const refetchText = await refetchResponse.text();
        console.log("[TEST-LABEL] Refetch labels:", refetchText);

        try {
          const refetchLabels = JSON.parse(refetchText);
          if (Array.isArray(refetchLabels)) {
            labels = refetchLabels;
            pagoLabel = refetchLabels.find((l: any) => 
              l.name?.toLowerCase() === "pago"
            );
            console.log("[TEST-LABEL] Pago label after create:", pagoLabel);
          }
        } catch (e) {
          console.log("[TEST-LABEL] Failed to parse refetch labels:", e);
        }
      }
    }

    if (!pagoLabel) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Label 'Pago' not found and could not be created",
        availableLabels: Array.isArray(labels) ? labels.map((l: any) => ({ id: l.labelid || l.id, name: l.name })) : [],
        createdLabel,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pagoLabelId = pagoLabel.labelid || pagoLabel.id;
    console.log("[TEST-LABEL] Pago label ID:", pagoLabelId);

    // Step 3: Apply label to chat
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

    // Update config with new label id if it was created
    if (pagoLabelId) {
      await supabase
        .from("tag_whats_configs")
        .update({ pago_label_id: pagoLabelId })
        .eq("instance_id", instance.id);
    }

    return new Response(JSON.stringify({
      success: applyResponse.ok,
      labelsFound: Array.isArray(labels) ? labels.length : 0,
      allLabels: Array.isArray(labels) ? labels.map((l: any) => ({ id: l.labelid || l.id, name: l.name })) : [],
      pagoLabel: pagoLabel,
      pagoLabelId: pagoLabelId,
      applyStatus: applyResponse.status,
      applyResponse: applyText,
      createdLabel,
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
