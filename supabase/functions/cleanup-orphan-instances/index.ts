import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CleanupResult {
  orphanedDeleted: number;
  disconnectedDeleted: number;
  errors: string[];
  details: {
    orphaned: string[];
    disconnected: string[];
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

    const result: CleanupResult = {
      orphanedDeleted: 0,
      disconnectedDeleted: 0,
      errors: [],
      details: {
        orphaned: [],
        disconnected: [],
      },
    };

    // Parse request body for options
    let dryRun = false;
    let deleteDisconnected = true;
    let deleteOrphaned = true;
    
    try {
      const body = await req.json();
      dryRun = body.dryRun === true;
      if (body.deleteDisconnected !== undefined) deleteDisconnected = body.deleteDisconnected;
      if (body.deleteOrphaned !== undefined) deleteOrphaned = body.deleteOrphaned;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`[CLEANUP] Starting cleanup - dryRun: ${dryRun}, deleteDisconnected: ${deleteDisconnected}, deleteOrphaned: ${deleteOrphaned}`);

    // Get global API config
    const { data: apiConfig } = await supabase
      .from("whatsapp_api_config")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const baseUrl = apiConfig?.base_url || Deno.env.get("EVOLUTION_BASE_URL");
    const apiKey = apiConfig?.api_key || Deno.env.get("EVOLUTION_API_KEY");
    const provider = apiConfig?.provider || "evolution";

    if (!baseUrl || !apiKey) {
      throw new Error("API configuration not found");
    }

    // Fetch all instances from the API
    let apiInstances: string[] = [];
    
    try {
      if (provider === "uazapi") {
        const listPath = apiConfig?.uazapi_list_instances_path || "/instance/all";
        const listMethod = apiConfig?.uazapi_list_instances_method || "GET";
        const adminHeader = apiConfig?.uazapi_admin_header || "admintoken";

        const response = await fetch(`${baseUrl}${listPath}`, {
          method: listMethod,
          headers: {
            [adminHeader]: apiKey,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          // UazAPI returns array of instance objects
          if (Array.isArray(data)) {
            apiInstances = data.map((inst: any) => inst.name || inst.instance_name || inst.instanceName).filter(Boolean);
          }
        } else {
          console.error(`[CLEANUP] Failed to fetch instances from UazAPI: ${response.status}`);
          result.errors.push(`Failed to fetch from UazAPI: ${response.status}`);
        }
      } else {
        // Evolution API
        const response = await fetch(`${baseUrl}/instance/fetchInstances`, {
          method: "GET",
          headers: {
            apikey: apiKey,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            apiInstances = data.map((inst: any) => inst.instance?.instanceName || inst.instanceName || inst.name).filter(Boolean);
          }
        } else {
          console.error(`[CLEANUP] Failed to fetch instances from Evolution: ${response.status}`);
          result.errors.push(`Failed to fetch from Evolution: ${response.status}`);
        }
      }
    } catch (error: any) {
      console.error("[CLEANUP] Error fetching API instances:", error);
      result.errors.push(`Error fetching API instances: ${error?.message || error}`);
    }

    console.log(`[CLEANUP] Found ${apiInstances.length} instances in API`);

    // Get all instances from database
    const { data: dbInstances, error: dbError } = await supabase
      .from("maturador_instances")
      .select("id, instance_name, phone_number, status, user_id");

    if (dbError) {
      throw new Error(`Failed to fetch DB instances: ${dbError.message}`);
    }

    console.log(`[CLEANUP] Found ${dbInstances?.length || 0} instances in database`);

    // Process orphaned instances (exist in DB but not in API)
    if (deleteOrphaned && apiInstances.length > 0) {
      const orphanedInstances = dbInstances?.filter(
        (dbInst) => !apiInstances.includes(dbInst.instance_name)
      ) || [];

      console.log(`[CLEANUP] Found ${orphanedInstances.length} orphaned instances`);

      for (const instance of orphanedInstances) {
        const identifier = instance.phone_number || instance.instance_name;
        
        if (dryRun) {
          result.details.orphaned.push(`[DRY RUN] Would delete orphaned: ${identifier}`);
          result.orphanedDeleted++;
        } else {
          try {
            // Delete related data first
            await supabase.from("inbox_messages").delete().eq("instance_id", instance.id);
            await supabase.from("inbox_flow_sessions").delete().eq("instance_id", instance.id);
            await supabase.from("inbox_contacts").delete().eq("instance_id", instance.id);
            await supabase.from("maturador_conversations").delete().eq("instance_id", instance.id);
            
            // Delete the instance
            const { error: deleteError } = await supabase
              .from("maturador_instances")
              .delete()
              .eq("id", instance.id);

            if (deleteError) {
              result.errors.push(`Failed to delete orphaned ${identifier}: ${deleteError.message}`);
            } else {
              result.details.orphaned.push(`Deleted orphaned: ${identifier}`);
              result.orphanedDeleted++;
            }
          } catch (error: any) {
            result.errors.push(`Error deleting orphaned ${identifier}: ${error?.message || error}`);
          }
        }
      }
    }

    // Process disconnected instances
    if (deleteDisconnected) {
      const disconnectedInstances = dbInstances?.filter(
        (inst) => inst.status === "disconnected" || inst.status === "close"
      ) || [];

      console.log(`[CLEANUP] Found ${disconnectedInstances.length} disconnected instances`);

      for (const instance of disconnectedInstances) {
        const identifier = instance.phone_number || instance.instance_name;
        
        if (dryRun) {
          result.details.disconnected.push(`[DRY RUN] Would delete disconnected: ${identifier}`);
          result.disconnectedDeleted++;
        } else {
          try {
            // Try to delete from API first (if it exists there)
            if (provider === "uazapi") {
              try {
                await fetch(`${baseUrl}/instance/logout/${instance.instance_name}`, {
                  method: "DELETE",
                  headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                  },
                });
              } catch {
                // Ignore API errors, instance might not exist
              }
            }

            // Delete related data
            await supabase.from("inbox_messages").delete().eq("instance_id", instance.id);
            await supabase.from("inbox_flow_sessions").delete().eq("instance_id", instance.id);
            await supabase.from("inbox_contacts").delete().eq("instance_id", instance.id);
            await supabase.from("maturador_conversations").delete().eq("instance_id", instance.id);
            
            // Delete the instance from DB
            const { error: deleteError } = await supabase
              .from("maturador_instances")
              .delete()
              .eq("id", instance.id);

            if (deleteError) {
              result.errors.push(`Failed to delete disconnected ${identifier}: ${deleteError.message}`);
            } else {
              result.details.disconnected.push(`Deleted disconnected: ${identifier}`);
              result.disconnectedDeleted++;
            }
          } catch (error: any) {
            result.errors.push(`Error deleting disconnected ${identifier}: ${error?.message || error}`);
          }
        }
      }
    }

    console.log(`[CLEANUP] Complete - Orphaned: ${result.orphanedDeleted}, Disconnected: ${result.disconnectedDeleted}, Errors: ${result.errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        ...result,
        summary: `Deleted ${result.orphanedDeleted} orphaned and ${result.disconnectedDeleted} disconnected instances`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[CLEANUP] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
