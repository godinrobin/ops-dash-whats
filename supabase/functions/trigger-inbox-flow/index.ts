// Supabase Edge Function: trigger-inbox-flow
// Creates (or resets) an inbox flow session and immediately processes it.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FlowNode = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickStartNodeId(nodes: unknown): string {
  const arr = Array.isArray(nodes) ? (nodes as FlowNode[]) : [];
  const start = arr.find((n) => (n?.type ?? "").toLowerCase() === "start");
  return start?.id ?? "start-1";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const runId = crypto.randomUUID().slice(0, 8);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error(`[${runId}] Missing backend env vars`);
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceClient = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.warn(`[${runId}] Unauthorized:`, userError?.message);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const flowId = (body?.flowId ?? "") as string;
    const contactId = (body?.contactId ?? "") as string;

    if (!flowId || !contactId) {
      return jsonResponse({ error: "Missing flowId/contactId" }, 400);
    }

    const nowIso = new Date().toISOString();

    const { data: contact, error: contactError } = await serviceClient
      .from("inbox_contacts")
      .select("id, user_id, instance_id, name, phone")
      .eq("id", contactId)
      .maybeSingle();

    if (contactError) {
      console.error(`[${runId}] Contact fetch error:`, contactError);
      return jsonResponse({ error: "Failed to load contact" }, 500);
    }

    if (!contact) {
      return jsonResponse({ error: "Contact not found" }, 404);
    }

    if (contact.user_id !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: flow, error: flowError } = await serviceClient
      .from("inbox_flows")
      .select("id, user_id, name, nodes, assigned_instances, is_active")
      .eq("id", flowId)
      .maybeSingle();

    if (flowError) {
      console.error(`[${runId}] Flow fetch error:`, flowError);
      return jsonResponse({ error: "Failed to load flow" }, 500);
    }

    if (!flow) {
      return jsonResponse({ error: "Flow not found" }, 404);
    }

    if (flow.user_id !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Optional safety: if flow is assigned to instances, enforce contact instance match
    const assignedInstances = Array.isArray(flow.assigned_instances) ? flow.assigned_instances : [];
    if (assignedInstances.length > 0) {
      if (!contact.instance_id || !assignedInstances.includes(contact.instance_id)) {
        return jsonResponse({
          error: "Flow not assigned to this contact instance",
        }, 400);
      }
    }

    const startNodeId = pickStartNodeId(flow.nodes);

    const baseVariables = {
      lastMessage: "",
      contactName: contact.name || contact.phone,
      _sent_node_ids: [] as string[],
    };

    // If another flow is active for this contact, complete it so we can start/restart the chosen flow
    const { data: otherActiveSession } = await serviceClient
      .from("inbox_flow_sessions")
      .select("id, flow_id")
      .eq("contact_id", contactId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otherActiveSession && otherActiveSession.flow_id !== flowId) {
      const { error: completeError } = await serviceClient
        .from("inbox_flow_sessions")
        .update({ status: "completed", last_interaction: nowIso })
        .eq("id", otherActiveSession.id)
        .eq("user_id", user.id);

      if (completeError) {
        console.warn(`[${runId}] Could not complete previous session (continuing):`, completeError);
      }
    }

    // IMPORTANT: The DB has a unique constraint for (flow_id, contact_id).
    // So we must UPSERT (create or restart) the single session for this pair.
    const { data: sessionRow, error: sessionError } = await serviceClient
      .from("inbox_flow_sessions")
      .upsert(
        {
          flow_id: flowId,
          contact_id: contactId,
          instance_id: contact.instance_id,
          user_id: user.id,
          current_node_id: startNodeId,
          variables: baseVariables,
          status: "active",
          started_at: nowIso,
          last_interaction: nowIso,
          processing: false,
          processing_started_at: null,
        },
        { onConflict: "flow_id,contact_id" },
      )
      .select("id")
      .maybeSingle();

    if (sessionError) {
      const code = (sessionError as any)?.code;
      console.error(`[${runId}] Upsert session error:`, { code, message: sessionError.message });
      return jsonResponse({ error: "Failed to create flow session" }, 500);
    }

    let sessionIdToRun: string | null = sessionRow?.id ?? null;

    if (!sessionIdToRun) {
      // Extremely defensive fallback: fetch the session id
      const { data: existing } = await serviceClient
        .from("inbox_flow_sessions")
        .select("id")
        .eq("contact_id", contactId)
        .eq("flow_id", flowId)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      sessionIdToRun = existing?.id ?? null;
    }

    if (!sessionIdToRun) {
      return jsonResponse({ error: "Failed to create flow session" }, 500);
    }

    // Process flow
    const { error: invokeError } = await serviceClient.functions.invoke("process-inbox-flow", {
      body: { sessionId: sessionIdToRun },
    });

    if (invokeError) {
      console.error(`[${runId}] Invoke process-inbox-flow error:`, invokeError);
      return jsonResponse({ error: "Failed to execute flow" }, 500);
    }

    console.log(`[${runId}] Triggered flow`, { flowId, contactId, sessionId: sessionIdToRun });

    return jsonResponse({ ok: true, sessionId: sessionIdToRun, flowName: flow.name });
  } catch (e) {
    console.error("[trigger-inbox-flow] Unhandled error:", e);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
