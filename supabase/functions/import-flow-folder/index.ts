import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ImportFolderPayload = {
  folderId: string;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: "Backend not configured" },
        500,
      );
    }

    const authHeader = req.headers.get("Authorization") || "";

    // Authenticated client (uses caller JWT)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await authClient.auth.getUser();
    const userId = userData?.user?.id;
    if (userErr || !userId) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const payload = (await req.json().catch(() => null)) as ImportFolderPayload | null;
    const folderId = payload?.folderId?.trim();

    if (!folderId || !UUID_RE.test(folderId)) {
      return jsonResponse({ ok: false, error: "Invalid folderId" }, 400);
    }

    // Service client (bypasses RLS) to read source folder+flows and write copies
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: sourceFolder, error: folderErr } = await admin
      .from("inbox_flow_folders")
      .select("id,name")
      .eq("id", folderId)
      .maybeSingle();

    if (folderErr) {
      console.error("[import-flow-folder] folder select error", folderErr);
      return jsonResponse({ ok: false, error: "Failed to load folder" }, 500);
    }

    if (!sourceFolder) {
      return jsonResponse({ ok: false, error: "Folder not found" }, 404);
    }

    const { data: sourceFlows, error: flowsErr } = await admin
      .from("inbox_flows")
      .select("*")
      .eq("folder_id", folderId);

    if (flowsErr) {
      console.error("[import-flow-folder] flows select error", flowsErr);
      return jsonResponse({ ok: false, error: "Failed to load folder flows" }, 500);
    }

    const { data: newFolder, error: newFolderErr } = await admin
      .from("inbox_flow_folders")
      .insert({
        user_id: userId,
        name: `${sourceFolder.name} (Importado)`,
      })
      .select("id,name")
      .single();

    if (newFolderErr || !newFolder) {
      console.error("[import-flow-folder] folder insert error", newFolderErr);
      return jsonResponse({ ok: false, error: "Failed to create folder" }, 500);
    }

    const inserts = (sourceFlows || []).map((f: any) => ({
      user_id: userId,
      folder_id: newFolder.id,
      name: `${f.name} (Importado)`,
      description: f.description,
      nodes: f.nodes,
      edges: f.edges,
      trigger_type: f.trigger_type,
      trigger_keywords: f.trigger_keywords,
      assigned_instances: [],
      is_active: false,
      priority: f.priority,
      pause_on_media: f.pause_on_media,
      pause_schedule_enabled: f.pause_schedule_enabled,
      pause_schedule_start: f.pause_schedule_start,
      pause_schedule_end: f.pause_schedule_end,
      reply_to_last_message: f.reply_to_last_message,
      reply_mode: f.reply_mode,
      reply_interval: f.reply_interval,
      pause_other_flows: f.pause_other_flows,
      keyword_match_type: f.keyword_match_type,
    }));

    if (inserts.length > 0) {
      const { error: insertFlowsErr } = await admin.from("inbox_flows").insert(inserts);
      if (insertFlowsErr) {
        console.error("[import-flow-folder] flows insert error", insertFlowsErr);
        return jsonResponse(
          {
            ok: false,
            error: "Folder created, but failed to import flows",
            newFolderId: newFolder.id,
          },
          500,
        );
      }
    }

    return jsonResponse({
      ok: true,
      newFolderId: newFolder.id,
      importedFlows: inserts.length,
    });
  } catch (err) {
    console.error("[import-flow-folder] unhandled", err);
    return jsonResponse({ ok: false, error: "Unexpected error" }, 500);
  }
});
