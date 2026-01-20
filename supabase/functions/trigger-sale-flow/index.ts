// Supabase Edge Function: trigger-sale-flow
// Triggers all active flows with trigger_type='sale' for a given contact.
// Can be called when a sale is identified (via webhook or manual trigger).
// If pause_other_flows is enabled, it will pause all other active flow sessions first.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

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
  console.log(`[${runId}] === TRIGGER-SALE-FLOW START ===`);

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
    const contactId = (body?.contactId ?? "") as string;
    const flowId = (body?.flowId ?? "") as string; // Optional: specific flow to trigger

    if (!contactId) {
      return jsonResponse({ error: "Missing contactId" }, 400);
    }

    const nowIso = new Date().toISOString();

    // Fetch the contact
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

    // Fetch sale-trigger flows for this user
    let flowQuery = serviceClient
      .from("inbox_flows")
      .select("id, user_id, name, nodes, assigned_instances, is_active, trigger_type, pause_other_flows")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("trigger_type", "sale");

    // If a specific flowId was provided, filter by it
    if (flowId) {
      flowQuery = flowQuery.eq("id", flowId);
    }

    const { data: saleFlows, error: flowError } = await flowQuery;

    if (flowError) {
      console.error(`[${runId}] Flow fetch error:`, flowError);
      return jsonResponse({ error: "Failed to load flows" }, 500);
    }

    if (!saleFlows || saleFlows.length === 0) {
      console.log(`[${runId}] No active sale flows found for user ${user.id}`);
      return jsonResponse({ ok: true, message: "No sale flows to trigger", triggered: 0 });
    }

    console.log(`[${runId}] Found ${saleFlows.length} active sale flow(s)`);

    const triggeredFlows: { flowId: string; flowName: string; sessionId: string }[] = [];
    const errors: { flowId: string; error: string }[] = [];

    for (const flow of saleFlows) {
      try {
        // Check if flow is assigned to specific instances
        const assignedInstances = Array.isArray(flow.assigned_instances) ? flow.assigned_instances : [];
        if (assignedInstances.length > 0) {
          if (!contact.instance_id || !assignedInstances.includes(contact.instance_id)) {
            console.log(`[${runId}] Flow "${flow.name}" not assigned to contact's instance, skipping`);
            continue;
          }
        }

        const startNodeId = pickStartNodeId(flow.nodes);
        const shouldPauseOtherFlows = flow.pause_other_flows === true;

        const baseVariables = {
          lastMessage: "",
          contactName: contact.name || contact.phone,
          _sent_node_ids: [] as string[],
          _triggered_by: "sale",
        };

        // If pause_other_flows is enabled, pause all active sessions for this contact
        if (shouldPauseOtherFlows) {
          const { data: allActiveSessions } = await serviceClient
            .from("inbox_flow_sessions")
            .select("id, flow_id, variables")
            .eq("contact_id", contactId)
            .eq("user_id", user.id)
            .eq("status", "active")
            .neq("flow_id", flow.id);

          if (allActiveSessions && allActiveSessions.length > 0) {
            console.log(`[${runId}] Pausing ${allActiveSessions.length} active sessions for sale flow "${flow.name}"`);
            
            for (const session of allActiveSessions) {
              const sessionVars = (session.variables || {}) as Record<string, unknown>;
              const hasPendingDelay = !!(sessionVars._pendingDelay);
              
              if (hasPendingDelay) {
                await serviceClient
                  .from("inbox_flow_delay_jobs")
                  .update({ status: "cancelled", updated_at: nowIso })
                  .eq("session_id", session.id)
                  .eq("status", "scheduled");
              }
              
              await serviceClient
                .from("inbox_flow_sessions")
                .update({ status: "paused", last_interaction: nowIso })
                .eq("id", session.id)
                .eq("user_id", user.id);
            }
          }
        }

        // Create/upsert the session
        const { data: sessionRow, error: sessionError } = await serviceClient
          .from("inbox_flow_sessions")
          .upsert(
            {
              flow_id: flow.id,
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
          console.error(`[${runId}] Session error for flow ${flow.id}:`, sessionError);
          errors.push({ flowId: flow.id, error: sessionError.message });
          continue;
        }

        const sessionId = sessionRow?.id;
        if (!sessionId) {
          errors.push({ flowId: flow.id, error: "Failed to create session" });
          continue;
        }

        // Trigger the flow processing asynchronously
        const processFlowPromise = (async () => {
          try {
            const { error: invokeError } = await serviceClient.functions.invoke("process-inbox-flow", {
              body: { sessionId },
            });

            if (invokeError) {
              console.error(`[${runId}] Flow processing error for ${flow.id}:`, invokeError);
            } else {
              console.log(`[${runId}] Flow "${flow.name}" processing completed`);
            }
          } catch (err) {
            console.error(`[${runId}] Flow processing exception:`, err);
          }
        })();

        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
          EdgeRuntime.waitUntil(processFlowPromise);
        } else {
          await processFlowPromise;
        }

        triggeredFlows.push({
          flowId: flow.id,
          flowName: flow.name,
          sessionId,
        });

        console.log(`[${runId}] Triggered sale flow "${flow.name}" for contact ${contactId}`);
      } catch (flowErr) {
        console.error(`[${runId}] Error processing flow ${flow.id}:`, flowErr);
        errors.push({ flowId: flow.id, error: String(flowErr) });
      }
    }

    console.log(`[${runId}] === TRIGGER-SALE-FLOW END === Triggered: ${triggeredFlows.length}, Errors: ${errors.length}`);

    return jsonResponse({
      ok: true,
      triggered: triggeredFlows.length,
      flows: triggeredFlows,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("[trigger-sale-flow] Unhandled error:", e);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
