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
    let orphaned = 0;
    let phoneUpdated = 0;
    let statusFixed = 0;

    // Process each database instance
    for (const dbInst of dbInstances || []) {
      const uazapiInst = uazapiMap.get(dbInst.instance_name);

      if (!uazapiInst) {
        // Instance doesn't exist in UAZAPI - mark as disconnected (orphaned)
        // ALWAYS mark as disconnected if not in UAZAPI, regardless of current status
        if (dbInst.status !== 'disconnected') {
          const { error: updateError } = await supabase
            .from("maturador_instances")
            .update({ 
              status: 'disconnected',
              disconnected_at: new Date().toISOString()
            })
            .eq("id", dbInst.id);

          if (!updateError) {
            orphaned++;
            console.log(`[admin-sync-instances] Orphaned (not in UAZAPI): ${dbInst.instance_name}`);
          }
        }
      } else {
        // Instance exists in UAZAPI - update status and phone
        const updates: Record<string, unknown> = {};
        
        // Map UAZAPI status to our status
        const uazapiStatus = uazapiInst.status?.toLowerCase();
        let newStatus = dbInst.status;
        
        if (uazapiStatus === 'open' || uazapiStatus === 'connected') {
          newStatus = 'connected';
        } else if (uazapiStatus === 'close' || uazapiStatus === 'closed' || uazapiStatus === 'disconnected') {
          newStatus = 'disconnected';
        } else if (uazapiStatus === 'connecting' || uazapiStatus === 'qrcode') {
          newStatus = 'connecting';
        }

        // Check if status changed
        if (newStatus !== dbInst.status) {
          updates.status = newStatus;
          statusFixed++;
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

    // Count actual stats from UAZAPI
    const realConnected = uazapiInstances.filter(i => 
      i.status?.toLowerCase() === 'open' || i.status?.toLowerCase() === 'connected'
    ).length;
    
    const realDisconnected = uazapiInstances.filter(i => 
      i.status?.toLowerCase() === 'close' || i.status?.toLowerCase() === 'closed' || i.status?.toLowerCase() === 'disconnected'
    ).length;
    
    const realConnecting = uazapiInstances.filter(i => 
      i.status?.toLowerCase() === 'connecting' || i.status?.toLowerCase() === 'qrcode'
    ).length;

    console.log(`[admin-sync-instances] Sync complete:`);
    console.log(`  - Total in UAZAPI: ${uazapiInstances.length}`);
    console.log(`  - Real connected in UAZAPI: ${realConnected}`);
    console.log(`  - Real disconnected in UAZAPI: ${realDisconnected}`);
    console.log(`  - Real connecting in UAZAPI: ${realConnecting}`);
    console.log(`  - DB instances: ${dbInstances?.length || 0}`);
    console.log(`  - Orphaned (not in UAZAPI): ${orphaned}`);
    console.log(`  - Status fixed: ${statusFixed}`);
    console.log(`  - Phone updated: ${phoneUpdated}`);
    console.log(`  - Total updated: ${updated}`);

    return new Response(JSON.stringify({
      success: true,
      totalInUazapi: uazapiInstances.length,
      totalInDb: dbInstances?.length || 0,
      realConnected,
      realDisconnected,
      realConnecting,
      orphaned,
      statusFixed,
      phoneUpdated,
      updated,
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