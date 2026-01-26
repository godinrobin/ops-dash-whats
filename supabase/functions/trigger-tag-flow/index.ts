import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * trigger-tag-flow
 * Triggers flows based on tag changes on contacts.
 * Called when a tag is added to a contact (from frontend or flow TagNode).
 * 
 * Body:
 * - contactId: string (required)
 * - tagName: string (required) - The tag that was just added
 * - userId: string (required)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { contactId, tagName, userId, sourceFlowId } = await req.json();

    if (!contactId || !tagName || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: contactId, tagName, userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[trigger-tag-flow] Tag "${tagName}" added to contact ${contactId} for user ${userId}${sourceFlowId ? ` (from flow ${sourceFlowId})` : ''}`);

    // Get contact details
    const { data: contact, error: contactError } = await supabase
      .from("inbox_contacts")
      .select("id, user_id, instance_id, phone, name, tags, flow_paused")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      console.error("[trigger-tag-flow] Contact not found:", contactError);
      return new Response(
        JSON.stringify({ error: "Contact not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if contact has flow paused
    if (contact.flow_paused) {
      console.log(`[trigger-tag-flow] Contact ${contactId} has flow_paused=true, skipping trigger`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "flow_paused" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find active flows with trigger_type='tag' that match this tag
    const { data: tagFlows, error: flowsError } = await supabase
      .from("inbox_flows")
      .select("id, name, nodes, edges, assigned_instances, trigger_tags, pause_other_flows")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("trigger_type", "tag");

    if (flowsError) {
      console.error("[trigger-tag-flow] Error fetching tag flows:", flowsError);
      return new Response(
        JSON.stringify({ error: "Error fetching flows" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tagFlows || tagFlows.length === 0) {
      console.log(`[trigger-tag-flow] No active tag flows found for user ${userId}`);
      return new Response(
        JSON.stringify({ success: true, flowsTriggered: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter flows that match the added tag
    const matchingFlows = tagFlows.filter((flow) => {
      // Skip the source flow to prevent infinite loops
      if (sourceFlowId && flow.id === sourceFlowId) {
        console.log(`[trigger-tag-flow] Skipping source flow ${flow.id} to prevent loop`);
        return false;
      }
      
      const triggerTags = (flow.trigger_tags as string[]) || [];
      const tagMatches = triggerTags.some(
        (t) => t.toLowerCase().trim() === tagName.toLowerCase().trim()
      );

      // Check instance assignment
      const assignedInstances = (flow.assigned_instances as string[]) || [];
      const instanceMatches =
        assignedInstances.length === 0 ||
        (contact.instance_id && assignedInstances.includes(contact.instance_id));

      return tagMatches && instanceMatches;
    });

    if (matchingFlows.length === 0) {
      console.log(`[trigger-tag-flow] No flows matched tag "${tagName}"`);
      return new Response(
        JSON.stringify({ success: true, flowsTriggered: 0, checkedFlows: tagFlows.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[trigger-tag-flow] Found ${matchingFlows.length} matching flows for tag "${tagName}"`);

    // Check if there's already an active session for this contact
    const { data: existingSessions } = await supabase
      .from("inbox_flow_sessions")
      .select("id, flow_id")
      .eq("contact_id", contactId)
      .eq("status", "active");

    // If there are active sessions and the new flow has pause_other_flows, pause them
    let triggeredCount = 0;

    for (const flow of matchingFlows) {
      // Check if already has an active session for this flow
      const hasActiveSession = existingSessions?.some((s) => s.flow_id === flow.id);
      if (hasActiveSession) {
        console.log(`[trigger-tag-flow] Contact already has active session for flow ${flow.id}, skipping`);
        continue;
      }

      // If this flow has pause_other_flows, pause existing sessions
      if (flow.pause_other_flows && existingSessions && existingSessions.length > 0) {
        const sessionIds = existingSessions.map((s) => s.id);
        await supabase
          .from("inbox_flow_sessions")
          .update({ status: "paused" })
          .in("id", sessionIds);
        
        // Cancel any pending delay jobs
        await supabase
          .from("inbox_flow_delay_jobs")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .in("session_id", sessionIds)
          .eq("status", "scheduled");

        console.log(`[trigger-tag-flow] Paused ${sessionIds.length} existing sessions for pause_other_flows`);
      }

      // Find start node
      const nodes = (flow.nodes as Array<{ id: string; type: string }>) || [];
      const startNode = nodes.find((n) => n.type === "start" || n.type === "startNode");

      if (!startNode) {
        console.log(`[trigger-tag-flow] Flow ${flow.id} has no start node, skipping`);
        continue;
      }

      // Create new session
      const { data: session, error: sessionError } = await supabase
        .from("inbox_flow_sessions")
        .insert({
          flow_id: flow.id,
          contact_id: contactId,
          instance_id: contact.instance_id,
          user_id: userId,
          current_node_id: startNode.id,
          status: "active",
          variables: {
            nome: contact.name || "",
            telefone: contact.phone,
            contactName: contact.name || "",
            _triggeredByTag: tagName,
          },
        })
        .select("id")
        .single();

      if (sessionError) {
        console.error(`[trigger-tag-flow] Error creating session for flow ${flow.id}:`, sessionError);
        continue;
      }

      console.log(`[trigger-tag-flow] Created session ${session.id} for flow "${flow.name}"`);

      // Invoke process-inbox-flow to start execution
      try {
        const { error: invokeError } = await supabase.functions.invoke("process-inbox-flow", {
          body: { sessionId: session.id },
        });

        if (invokeError) {
          console.error(`[trigger-tag-flow] Error invoking process-inbox-flow:`, invokeError);
        } else {
          console.log(`[trigger-tag-flow] Flow "${flow.name}" started successfully`);
          triggeredCount++;
        }
      } catch (e) {
        console.error(`[trigger-tag-flow] Exception invoking process-inbox-flow:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        flowsTriggered: triggeredCount,
        tagName,
        contactId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trigger-tag-flow] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
