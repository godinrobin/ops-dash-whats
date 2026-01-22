import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UazApiInstance {
  instance: string;
  status: string;
  number?: string;
  me?: {
    id?: string;
    pushname?: string;
    number?: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch UAZAPI config
    const { data: config } = await supabase
      .from("whatsapp_api_config")
      .select("*")
      .single();

    if (!config?.uazapi_base_url || !config?.uazapi_api_token) {
      return new Response(JSON.stringify({ 
        error: "UAZAPI not configured",
        synced: 0,
        disconnected: 0,
        updated: 0
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = config.uazapi_base_url.replace(/\/$/, "");
    const adminToken = config.uazapi_api_token;

    console.log(`[admin-sync-instances] Fetching instances from UAZAPI: ${baseUrl}`);

    // Fetch all instances from UAZAPI
    const uazapiResponse = await fetch(`${baseUrl}/instance/all`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "admintoken": adminToken,
      },
    });

    if (!uazapiResponse.ok) {
      const errorText = await uazapiResponse.text();
      console.error(`[admin-sync-instances] UAZAPI error: ${uazapiResponse.status} - ${errorText}`);
      return new Response(JSON.stringify({ 
        error: `UAZAPI returned ${uazapiResponse.status}`,
        details: errorText
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uazapiInstances: UazApiInstance[] = await uazapiResponse.json();
    console.log(`[admin-sync-instances] Got ${uazapiInstances.length} instances from UAZAPI`);

    // Create a map of instance names to their UAZAPI data
    const uazapiMap = new Map<string, UazApiInstance>();
    for (const inst of uazapiInstances) {
      uazapiMap.set(inst.instance, inst);
    }

    // Fetch all instances from our database
    const { data: dbInstances, error: dbError } = await supabase
      .from("maturador_instances")
      .select("id, instance_name, phone_number, status");

    if (dbError) {
      console.error(`[admin-sync-instances] DB error:`, dbError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    let disconnected = 0;
    let phoneUpdated = 0;

    // Process each database instance
    for (const dbInst of dbInstances || []) {
      const uazapiInst = uazapiMap.get(dbInst.instance_name);

      if (!uazapiInst) {
        // Instance doesn't exist in UAZAPI - mark as disconnected
        if (dbInst.status === 'connected' || dbInst.status === 'open') {
          const { error: updateError } = await supabase
            .from("maturador_instances")
            .update({ 
              status: 'disconnected',
              disconnected_at: new Date().toISOString()
            })
            .eq("id", dbInst.id);

          if (!updateError) {
            disconnected++;
            console.log(`[admin-sync-instances] Marked as disconnected: ${dbInst.instance_name}`);
          }
        }
      } else {
        // Instance exists in UAZAPI - update status and phone
        const updates: Record<string, any> = {};
        
        // Map UAZAPI status to our status
        const uazapiStatus = uazapiInst.status?.toLowerCase();
        let newStatus = dbInst.status;
        
        if (uazapiStatus === 'open' || uazapiStatus === 'connected') {
          newStatus = 'connected';
        } else if (uazapiStatus === 'close' || uazapiStatus === 'disconnected') {
          newStatus = 'disconnected';
        } else if (uazapiStatus === 'connecting' || uazapiStatus === 'qrcode') {
          newStatus = 'connecting';
        }

        // Check if status changed
        if (newStatus !== dbInst.status) {
          updates.status = newStatus;
          if (newStatus === 'connected') {
            updates.connected_at = new Date().toISOString();
          } else if (newStatus === 'disconnected') {
            updates.disconnected_at = new Date().toISOString();
          }
        }

        // Extract phone number from UAZAPI response
        let phoneNumber = uazapiInst.number;
        if (!phoneNumber && uazapiInst.me?.number) {
          phoneNumber = uazapiInst.me.number;
        }
        if (!phoneNumber && uazapiInst.me?.id) {
          // Extract number from JID format (5511999999999@s.whatsapp.net)
          const jid = uazapiInst.me.id;
          const match = jid.match(/^(\d+)@/);
          if (match) {
            phoneNumber = match[1];
          }
        }

        // Update phone if we got one and it's different
        if (phoneNumber && phoneNumber !== dbInst.phone_number) {
          updates.phone_number = phoneNumber;
          phoneUpdated++;
        }

        // Apply updates if any
        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from("maturador_instances")
            .update(updates)
            .eq("id", dbInst.id);

          if (!updateError) {
            updated++;
            console.log(`[admin-sync-instances] Updated: ${dbInst.instance_name}`, updates);
          }
        }
      }
    }

    // Count actual connected from UAZAPI
    const realConnected = uazapiInstances.filter(i => 
      i.status?.toLowerCase() === 'open' || i.status?.toLowerCase() === 'connected'
    ).length;

    console.log(`[admin-sync-instances] Sync complete - Updated: ${updated}, Disconnected: ${disconnected}, Phone updated: ${phoneUpdated}, Real connected in UAZAPI: ${realConnected}`);

    return new Response(JSON.stringify({
      success: true,
      totalInUazapi: uazapiInstances.length,
      realConnected,
      updated,
      disconnected,
      phoneUpdated,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[admin-sync-instances] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
