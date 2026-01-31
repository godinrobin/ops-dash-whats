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
  console.log(`[${runId}] === WEBHOOK-LOGZZ-SHIPMENT START ===`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      console.error(`[${runId}] Missing webhook token`);
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: webhook, error: webhookError } = await supabase
      .from('logzz_webhooks')
      .select('id, user_id, is_active, flow_id, event_type, name, instance_id')
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

    const body = await req.json();
    console.log(`[${runId}] Received Logzz shipment webhook for user:`, userId);
    console.log(`[${runId}] Payload:`, JSON.stringify(body).substring(0, 500));

    const recipientPhone = normalizePhone(body.recipient_phone);
    console.log(`[${runId}] Original phone: ${body.recipient_phone}, Normalized: ${recipientPhone}`);

    const shipmentData = {
      user_id: userId,
      webhook_id: webhook.id,
      // Informações do Envio
      creation_date: body.creation_date || null,
      code: body.code || null,
      status: body.status || null,
      cost: body.cost || null,
      product: body.product || null,
      quantity: body.quantity || null,
      shipping_date: body.shipping_date || null,
      delivery_date: body.delivery_date || null,
      tracking_code: body.tracking_code || null,
      carrier: body.carrier || null,
      freight_modality: body.freight_modality || null,
      freight_cost: body.freight_cost || null,
      sender: body.sender || null,
      external_id: body.external_id || null,
      // Informações do Destinatário
      recipient_name: body.recipient_name || null,
      recipient_email: body.recipient_email || null,
      recipient_phone: body.recipient_phone || null,
      recipient_document: body.recipient_document || null,
      recipient_zip_code: body.recipient_zip_code || null,
      recipient_street: body.recipient_street || null,
      recipient_number: body.recipient_number || null,
      recipient_complement: body.recipient_complement || null,
      recipient_neighborhood: body.recipient_neighborhood || null,
      recipient_city: body.recipient_city || null,
      recipient_state: body.recipient_state || null,
      recipient_country: body.recipient_country || null,
      // Informações da Agência
      agency_zip_code: body.agency_zip_code || null,
      agency_street: body.agency_street || null,
      agency_number: body.agency_number || null,
      agency_neighborhood: body.agency_neighborhood || null,
      agency_city: body.agency_city || null,
      // Payload original
      raw_payload: body,
    };

    const { data: insertedShipment, error: insertError } = await supabase
      .from('logzz_shipments')
      .insert(shipmentData)
      .select('id')
      .single();

    if (insertError) {
      console.error(`[${runId}] Error inserting shipment:`, insertError);
      return new Response(JSON.stringify({ error: 'Failed to save shipment', details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${runId}] Shipment saved successfully:`, insertedShipment.id);

    // Log event for admin visibility
    try {
      await supabase
        .from('logzz_webhook_events')
        .insert({
          user_id: userId,
          webhook_id: webhook.id,
          event_type: 'shipment',
          customer_name: body.recipient_name || null,
          customer_phone: recipientPhone,
          product_name: body.product || null,
          order_id: body.code || body.tracking_code || null,
          raw_payload: body,
        });
      console.log(`[${runId}] Event logged for admin with webhook_id: ${webhook.id}`);
    } catch (logError) {
      console.warn(`[${runId}] Failed to log event (non-critical):`, logError);
    }

    let flowTriggered = false;
    let flowError: string | null = null;

    // Helper to replace null/empty with space
    const safeVar = (val: unknown): string => {
      if (val === null || val === undefined || val === '') return ' ';
      return String(val);
    };

    if (flowId && recipientPhone) {
      console.log(`[${runId}] Flow configured (${flowId}), attempting to trigger with phone: ${recipientPhone}`);

      try {
        let instance: { id: string; instance_name: string } | null = null;

        // First try to use the configured instance from webhook
        if (configuredInstanceId) {
          console.log(`[${runId}] Using configured instance from webhook: ${configuredInstanceId}`);
          const { data: configuredInstance, error: configInstanceError } = await supabase
            .from('maturador_instances')
            .select('id, instance_name')
            .eq('id', configuredInstanceId)
            .eq('status', 'connected')
            .maybeSingle();

          if (!configInstanceError && configuredInstance) {
            instance = configuredInstance;
            console.log(`[${runId}] Found configured instance: ${instance.instance_name}`);
          } else {
            console.warn(`[${runId}] Configured instance not connected, falling back to first available`);
          }
        }

        // Fallback to first connected instance
        if (!instance) {
          const { data: fallbackInstance, error: fallbackError } = await supabase
            .from('maturador_instances')
            .select('id, instance_name')
            .eq('user_id', userId)
            .eq('status', 'connected')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!fallbackError && fallbackInstance) {
            instance = fallbackInstance;
            console.log(`[${runId}] Using fallback instance: ${instance.instance_name}`);
          }
        }

        if (!instance) {
          console.warn(`[${runId}] No connected instance found for user ${userId}`);
          flowError = 'No connected instance available';
        } else {
          console.log(`[${runId}] Using instance: ${instance.instance_name} (${instance.id})`);

          const remoteJid = `${recipientPhone}@s.whatsapp.net`;
          
          let { data: contact, error: contactFetchError } = await supabase
            .from('inbox_contacts')
            .select('id, name, phone')
            .eq('user_id', userId)
            .eq('instance_id', instance.id)
            .eq('phone', recipientPhone)
            .maybeSingle();

          if (contactFetchError) {
            console.error(`[${runId}] Error fetching contact:`, contactFetchError);
          }

          if (!contact) {
            console.log(`[${runId}] Creating new inbox contact for phone: ${recipientPhone}`);
            const { data: newContact, error: createError } = await supabase
              .from('inbox_contacts')
              .insert({
                user_id: userId,
                instance_id: instance.id,
                phone: recipientPhone,
                remote_jid: remoteJid,
                name: body.recipient_name || recipientPhone,
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
          } else {
            console.log(`[${runId}] Found existing contact: ${contact.id}`);
          }

          if (contact) {
            // Fetch the flow to get nodes
            // Note: We don't check is_active here because Logzz webhooks are external triggers
            // that should work regardless of the flow's active status (is_active is for keyword triggers)
            const { data: flow, error: flowFetchError } = await supabase
              .from('inbox_flows')
              .select('id, name, nodes')
              .eq('id', flowId)
              .eq('user_id', userId)
              .maybeSingle();

            if (flowFetchError || !flow) {
              console.error(`[${runId}] Flow not found or error:`, flowFetchError);
              flowError = 'Flow not found';
            } else {
              // Flow found - proceed with triggering (Logzz webhook triggers bypass is_active check)
              const nowIso = new Date().toISOString();
              const startNodeId = pickStartNodeId(flow.nodes);

              const baseVariables = {
                lastMessage: "",
                contactName: contact.name || contact.phone,
                nome: safeVar(body.recipient_name) !== ' ' ? body.recipient_name : (contact.name || recipientPhone),
                telefone: recipientPhone,
                // Logzz specific variables - shipment
                logzz_client_name: safeVar(body.recipient_name),
                logzz_client_phone: safeVar(body.recipient_phone),
                logzz_client_email: safeVar(body.recipient_email),
                logzz_client_document: safeVar(body.recipient_document),
                logzz_client_address_city: safeVar(body.recipient_city),
                logzz_client_address_state: safeVar(body.recipient_state),
                logzz_client_address_number: safeVar(body.recipient_number),
                logzz_client_address_country: safeVar(body.recipient_country),
                logzz_client_address_district: safeVar(body.recipient_neighborhood),
                logzz_client_address_street: safeVar(body.recipient_street),
                logzz_client_address_complement: safeVar(body.recipient_complement),
                logzz_client_address_zipcode: safeVar(body.recipient_zip_code),
                logzz_product_name: safeVar(body.product),
                logzz_quantity: safeVar(body.quantity),
                logzz_order_id: safeVar(body.code),
                logzz_order_status: safeVar(body.status),
                logzz_order_value: safeVar(body.cost),
                logzz_tracking_code: safeVar(body.tracking_code),
                logzz_carrier: safeVar(body.carrier),
                logzz_freight_modality: safeVar(body.freight_modality),
                logzz_freight_cost: safeVar(body.freight_cost),
                logzz_shipping_date: safeVar(body.shipping_date),
                logzz_delivery_date: safeVar(body.delivery_date),
                logzz_creation_date: safeVar(body.creation_date),
                logzz_sender: safeVar(body.sender),
                logzz_external_id: safeVar(body.external_id),
                // Agency info
                logzz_agency_city: safeVar(body.agency_city),
                logzz_agency_neighborhood: safeVar(body.agency_neighborhood),
                logzz_agency_street: safeVar(body.agency_street),
                logzz_agency_number: safeVar(body.agency_number),
                logzz_agency_zipcode: safeVar(body.agency_zip_code),
                _sent_node_ids: [] as string[],
                _triggered_by: "logzz_webhook_shipment",
                _logzz_shipment_id: insertedShipment.id,
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
                      console.log(`[${runId}] Flow "${flow.name}" processing completed for contact ${contact!.id}`);
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
      }
      if (!recipientPhone) {
        console.log(`[${runId}] No valid recipient phone to trigger flow`);
      }
    }

    console.log(`[${runId}] === WEBHOOK-LOGZZ-SHIPMENT END ===`);

    return new Response(JSON.stringify({ 
      success: true, 
      shipment_id: insertedShipment.id,
      flow_triggered: flowTriggered,
      flow_error: flowError,
      message: 'Shipment received successfully' 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error(`[${runId}] Error in webhook-logzz-shipment:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
