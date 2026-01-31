import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FlowNode = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
};

function pickStartNodeId(nodes: unknown): string {
  const arr = Array.isArray(nodes) ? (nodes as FlowNode[]) : [];
  const start = arr.find((n) => (n?.type ?? "").toLowerCase() === "start");
  return start?.id ?? "start-1";
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length >= 10 && cleaned.length <= 11 && !cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned.length >= 12 ? cleaned : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = crypto.randomUUID().slice(0, 8);
  console.log(`[${runId}] === WEBHOOK-GLOBAL START ===`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Token can come from query (?token=) or from body.token
    const url = new URL(req.url);
    const tokenFromQuery = url.searchParams.get('token');

    // Parse payload
    const parsedBody = await req.json().catch(() => ({}));
    const tokenFromBody = typeof parsedBody?.token === 'string' ? parsedBody.token : null;
    const token = tokenFromQuery ?? tokenFromBody;

    if (!token) {
      console.error(`[${runId}] Missing webhook token`);
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize payload - remove token if present
    const body = { ...(parsedBody ?? {}) };
    if ('token' in body) delete (body as Record<string, unknown>).token;

    // Validate token and get webhook config
    const { data: webhook, error: webhookError } = await supabase
      .from('global_webhooks')
      .select('id, user_id, is_active, flow_id, name, instance_id')
      .eq('webhook_token', token)
      .maybeSingle();

    if (webhookError || !webhook) {
      console.error(`[${runId}] Invalid webhook token:`, token);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!webhook.is_active) {
      console.error(`[${runId}] Webhook is disabled for token:`, token);
      return new Response(JSON.stringify({ error: 'Webhook disabled' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = webhook.user_id;
    const flowId = webhook.flow_id;
    const configuredInstanceId = webhook.instance_id;

    console.log(`[${runId}] Received global webhook for user:`, userId);
    console.log(`[${runId}] Payload:`, JSON.stringify(body).substring(0, 500));

    // Log the event
    try {
      await supabase.from('global_webhook_events').insert({
        user_id: userId,
        webhook_id: webhook.id,
        raw_payload: body,
      });
      console.log(`[${runId}] Event logged successfully`);
    } catch (logError) {
      console.warn(`[${runId}] Failed to log event (non-critical):`, logError);
    }

    let flowTriggered = false;
    let flowError: string | null = null;

    // Try to extract phone from payload (common fields)
    const possiblePhoneFields = ['phone', 'telefone', 'client_phone', 'customer_phone', 'whatsapp', 'celular', 'mobile'];
    let clientPhone: string | null = null;
    for (const field of possiblePhoneFields) {
      if (body[field]) {
        clientPhone = normalizePhone(body[field] as string);
        if (clientPhone) break;
      }
    }

    // Try to extract name from payload
    const possibleNameFields = ['name', 'nome', 'client_name', 'customer_name', 'full_name'];
    let clientName: string | null = null;
    for (const field of possibleNameFields) {
      if (body[field]) {
        clientName = body[field] as string;
        break;
      }
    }

    // Helper to safely get a string value
    const safeVar = (val: unknown): string => {
      if (val === null || val === undefined || val === '') return ' ';
      return String(val);
    };

    if (flowId && clientPhone) {
      console.log(`[${runId}] Flow configured (${flowId}), triggering with phone: ${clientPhone}`);

      try {
        let instance: { id: string; instance_name: string } | null = null;

        // First try configured instance
        if (configuredInstanceId) {
          const { data: configuredInstance } = await supabase
            .from('maturador_instances')
            .select('id, instance_name')
            .eq('id', configuredInstanceId)
            .eq('status', 'connected')
            .maybeSingle();

          if (configuredInstance) {
            instance = configuredInstance;
            console.log(`[${runId}] Using configured instance: ${instance.instance_name}`);
          }
        }

        // Fallback to first connected instance
        if (!instance) {
          const { data: fallbackInstance } = await supabase
            .from('maturador_instances')
            .select('id, instance_name')
            .eq('user_id', userId)
            .eq('status', 'connected')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (fallbackInstance) {
            instance = fallbackInstance;
            console.log(`[${runId}] Using fallback instance: ${instance.instance_name}`);
          }
        }

        if (!instance) {
          console.warn(`[${runId}] No connected instance found for user ${userId}`);
          flowError = 'No connected instance available';
        } else {
          const remoteJid = `${clientPhone}@s.whatsapp.net`;

          // Find or create contact
          let { data: contact } = await supabase
            .from('inbox_contacts')
            .select('id, name, phone')
            .eq('user_id', userId)
            .eq('instance_id', instance.id)
            .eq('phone', clientPhone)
            .maybeSingle();

          if (!contact) {
            console.log(`[${runId}] Creating new inbox contact for phone: ${clientPhone}`);
            const { data: newContact, error: createError } = await supabase
              .from('inbox_contacts')
              .insert({
                user_id: userId,
                instance_id: instance.id,
                phone: clientPhone,
                remote_jid: remoteJid,
                name: clientName || clientPhone,
              })
              .select('id, name, phone')
              .single();

            if (createError) {
              console.error(`[${runId}] Error creating contact:`, createError);
              flowError = 'Failed to create contact';
            } else {
              contact = newContact;
              console.log(`[${runId}] Contact created: ${contact.id}`);
            }
          }

          if (contact) {
            // Fetch the flow
            const { data: flow, error: flowFetchError } = await supabase
              .from('inbox_flows')
              .select('id, name, nodes')
              .eq('id', flowId)
              .eq('user_id', userId)
              .maybeSingle();

            if (flowFetchError || !flow) {
              console.error(`[${runId}] Flow not found:`, flowFetchError);
              flowError = 'Flow not found';
            } else {
              const nowIso = new Date().toISOString();
              const startNodeId = pickStartNodeId(flow.nodes);

              // Build variables from payload - map all fields with webhook_ prefix
              const webhookVariables: Record<string, string> = {};
              for (const [key, value] of Object.entries(body)) {
                webhookVariables[`webhook_${key}`] = safeVar(value);
              }

              const baseVariables = {
                lastMessage: "",
                contactName: safeVar(contact.name || contact.phone),
                nome: safeVar(clientName || contact.name || clientPhone),
                telefone: safeVar(clientPhone),
                ...webhookVariables,
                _sent_node_ids: [] as string[],
                _triggered_by: "global_webhook",
                _webhook_id: webhook.id,
              };

              console.log(`[${runId}] Creating flow session with variables:`, JSON.stringify(baseVariables));

              const { data: sessionRow, error: sessionError } = await supabase
                .from('inbox_flow_sessions')
                .upsert(
                  {
                    flow_id: flowId,
                    contact_id: contact.id,
                    instance_id: instance.id,
                    user_id: userId,
                    current_node_id: startNodeId,
                    variables: baseVariables,
                    status: 'active',
                    started_at: nowIso,
                    last_interaction: nowIso,
                    processing: false,
                    processing_started_at: null,
                  },
                  { onConflict: 'flow_id,contact_id' }
                )
                .select('id')
                .maybeSingle();

              if (sessionError) {
                console.error(`[${runId}] Session creation error:`, sessionError);
                flowError = 'Failed to create flow session';
              } else if (sessionRow) {
                console.log(`[${runId}] Flow session created: ${sessionRow.id}`);

                const processFlowPromise = (async () => {
                  try {
                    const { error: invokeError } = await supabase.functions.invoke('process-inbox-flow', {
                      body: { sessionId: sessionRow.id },
                    });

                    if (invokeError) {
                      console.error(`[${runId}] Flow processing error:`, invokeError);
                    } else {
                      console.log(`[${runId}] Flow "${flow.name}" processing completed`);
                    }
                  } catch (err) {
                    console.error(`[${runId}] Flow processing exception:`, err);
                  }
                })();

                if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
                  EdgeRuntime.waitUntil(processFlowPromise);
                  flowTriggered = true;
                  console.log(`[${runId}] Flow triggered async via waitUntil`);
                } else {
                  await processFlowPromise;
                  flowTriggered = true;
                  console.log(`[${runId}] Flow triggered sync`);
                }
              }
            }
          }
        }
      } catch (flowTriggerError) {
        console.error(`[${runId}] Exception while triggering flow:`, flowTriggerError);
        flowError = flowTriggerError instanceof Error ? flowTriggerError.message : 'Unknown error';
      }
    } else {
      if (!flowId) {
        console.log(`[${runId}] No flow configured for this webhook`);
        flowError = 'No flow configured';
      }
      if (!clientPhone) {
        console.log(`[${runId}] No valid phone found in payload`);
        flowError = 'No phone field found in payload (expected: phone, telefone, client_phone, customer_phone, whatsapp, celular, or mobile)';
      }
    }

    console.log(`[${runId}] === WEBHOOK-GLOBAL END ===`);

    return new Response(JSON.stringify({
      success: true,
      flow_triggered: flowTriggered,
      flow_error: flowError,
      message: 'Webhook received successfully',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error(`[${runId}] Error in webhook-global:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
