import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let dryRun = false;
    let limit = 50;
    
    try {
      const body = await req.json();
      dryRun = body.dryRun === true;
      if (body.limit) limit = Math.min(body.limit, 100);
    } catch {
      // defaults
    }

    console.log(`[CLEANUP] Starting - dryRun: ${dryRun}, limit: ${limit}`);

    // Get disconnected instances
    const { data: disconnected, error: fetchError } = await supabase
      .from("maturador_instances")
      .select("id, instance_name, phone_number")
      .in("status", ["disconnected", "close"])
      .limit(limit);

    if (fetchError) {
      throw new Error(`Fetch error: ${fetchError.message}`);
    }

    const count = disconnected?.length || 0;
    console.log(`[CLEANUP] Found ${count} disconnected instances`);

    if (dryRun || count === 0) {
      return new Response(
        JSON.stringify({ success: true, dryRun, count, message: dryRun ? `Would delete ${count}` : "No instances to delete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ids = disconnected!.map((i: any) => i.id);

    // Delete related data first (batch delete by instance IDs)
    await supabase.from("inbox_messages").delete().in("instance_id", ids);
    await supabase.from("inbox_flow_sessions").delete().in("instance_id", ids);
    await supabase.from("inbox_contacts").delete().in("instance_id", ids);
    await supabase.from("maturador_conversations").delete().in("instance_id", ids);

    // Delete instances
    const { error: deleteError, count: deletedCount } = await supabase
      .from("maturador_instances")
      .delete()
      .in("id", ids);

    if (deleteError) {
      throw new Error(`Delete error: ${deleteError.message}`);
    }

    // Check remaining
    const { count: remaining } = await supabase
      .from("maturador_instances")
      .select("*", { count: "exact", head: true })
      .in("status", ["disconnected", "close"]);

    console.log(`[CLEANUP] Deleted ${count}, remaining: ${remaining}`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: count,
        remaining: remaining || 0,
        message: remaining ? `Deleted ${count}. Run again for ${remaining} more.` : `Deleted ${count}. All clean!`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[CLEANUP] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
