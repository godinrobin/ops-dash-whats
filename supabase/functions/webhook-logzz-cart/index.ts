import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for Supabase Edge Functions
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
  // Remove everything except digits
  let cleaned = phone.replace(/\D/g, '');
  // If it starts with 55 (Brazil) and has 12-13 digits, it's likely already formatted
  // If it doesn't start with 55 but has 10-11 digits, add 55
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
  console.log(`[${runId}] === WEBHOOK-LOGZZ-CART START ===`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extrair token da URL
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      console.error(`[${runId}] Missing webhook token`);
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validar token e buscar user_id + flow_id
    const { data: webhook, error: webhookError } = await supabase
      .from('logzz_webhooks')
      .select('id, user_id, is_active, flow_id, event_type, name')
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

    // Verify this is a cart abandonment webhook
    if (webhook.event_type !== 'abandono_carrinho') {
      console.error(`[${runId}] Wrong event type. Expected: abandono_carrinho, Got: ${webhook.event_type}`);
      return new Response(JSON.stringify({ error: 'Wrong webhook event type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = webhook.user_id;
    const flowId = webhook.flow_id;

    // Parse payload
    const body = await req.json();
    console.log(`[${runId}] Received Logzz cart abandonment webhook for user:`, userId);
    console.log(`[${runId}] Payload:`, JSON.stringify(body).substring(0, 500));

    // Normalize client phone
    const clientPhone = normalizePhone(body.client_phone);
    console.log(`[${runId}] Original phone: ${body.client_phone}, Normalized: ${clientPhone}`);

    // Parse date_open_cart
    let dateOpenCart: string | null = null;
    if (body.date_open_cart) {
      try {
        // Try to parse various date formats
        const dateStr = body.date_open_cart;
        // Format: "dd/mm/yyyy HH:mm" or "dd/mm/yyyy HH:MM:ss"
        const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (match) {
          const [, day, month, year, hour, minute, second = '00'] = match;
          dateOpenCart = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).toISOString();
        }
      } catch (e) {
        console.warn(`[${runId}] Failed to parse date_open_cart:`, body.date_open_cart);
      }
    }

    // Extrair dados do payload Logzz - Abandono de Carrinho
    const cartData = {
      user_id: userId,
      webhook_id: webhook.id,
      // Informações do cliente
      client_name: body.client_name || null,
      client_email: body.client_email || null,
      client_document: body.client_document || null,
      client_phone: body.client_phone || null,
      client_zip_code: body.client_zip_code || null,
      client_address: body.client_address || null,
      client_address_number: body.client_address_number || null,
      client_address_district: body.client_address_district || null,
      client_address_comp: body.client_address_comp || null,
      client_address_city: body.client_address_city || null,
      client_address_state: body.client_address_state || null,
      client_address_country: body.client_address_country || null,
      // Informações do carrinho
      date_open_cart: dateOpenCart,
      cart_status: body.cart_status || null,
      // Informações da oferta
      sale_name: body.sale_name || body.offer_name || null,
      checkout_url: body.checkout_url || null,
      // Produtor/Afiliado
      producer_name: body.producer_name || null,
      producer_email: body.producer_email || null,
      affiliate_name: body.affiliate_name || null,
      affiliate_email: body.affiliate_email || null,
      affiliate_phone: body.affiliate_phone || null,
      // Produtos
      products: body.products || null,
      // Payload original
      raw_payload: body,
    };

    // Inserir abandono de carrinho
    const { data: insertedCart, error: insertError } = await supabase
      .from('logzz_cart_abandonments')
      .insert(cartData)
      .select('id')
      .single();

    if (insertError) {
      console.error(`[${runId}] Error inserting cart abandonment:`, insertError);
      return new Response(JSON.stringify({ error: 'Failed to save cart abandonment', details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${runId}] Cart abandonment saved successfully:`, insertedCart.id);

    // Log event for admin visibility
    try {
      const productName = body.products?.main?.[0]?.product_name || body.products?.[0]?.product_name || body.sale_name || null;
      await supabase
        .from('logzz_webhook_events')
        .insert({
          user_id: userId,
          event_type: 'cart',
          customer_name: body.client_name || null,
          customer_phone: clientPhone,
          product_name: productName,
          checkout_url: body.checkout_url || null,
          raw_payload: body,
        });
      console.log(`[${runId}] Event logged for admin`);
    } catch (logError) {
      console.warn(`[${runId}] Failed to log event (non-critical):`, logError);
    }

    // If there's a flow_id configured and we have a valid phone, trigger the flow
    let flowTriggered = false;
    let flowError: string | null = null;

    if (flowId && clientPhone) {
      console.log(`[${runId}] Flow configured (${flowId}), attempting to trigger with phone: ${clientPhone}`);

      try {
        // 1. First, we need an instance to send messages. Get user's first active instance.
        const { data: instance, error: instanceError } = await supabase
          .from('maturador_instances')
          .select('id, instance_name')
          .eq('user_id', userId)
          .eq('status', 'connected')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (instanceError || !instance) {
          console.warn(`[${runId}] No connected instance found for user ${userId}`);
          flowError = 'No connected instance available';
        } else {
          console.log(`[${runId}] Using instance: ${instance.instance_name} (${instance.id})`);

          // 2. Find or create inbox contact for this phone
          const remoteJid = `${clientPhone}@s.whatsapp.net`;
          
          let { data: contact, error: contactFetchError } = await supabase
            .from('inbox_contacts')
            .select('id, name, phone')
            .eq('user_id', userId)
            .eq('instance_id', instance.id)
            .eq('phone', clientPhone)
            .maybeSingle();

          if (contactFetchError) {
            console.error(`[${runId}] Error fetching contact:`, contactFetchError);
          }

          if (!contact) {
            // Create the contact
            console.log(`[${runId}] Creating new inbox contact for phone: ${clientPhone}`);
            const { data: newContact, error: createError } = await supabase
              .from('inbox_contacts')
              .insert({
                user_id: userId,
                instance_id: instance.id,
                phone: clientPhone,
                remote_jid: remoteJid,
                name: body.client_name || clientPhone,
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
            // 3. Fetch the flow to get nodes
            const { data: flow, error: flowFetchError } = await supabase
              .from('inbox_flows')
              .select('id, name, nodes, is_active')
              .eq('id', flowId)
              .eq('user_id', userId)
              .maybeSingle();

            if (flowFetchError || !flow) {
              console.error(`[${runId}] Flow not found or error:`, flowFetchError);
              flowError = 'Flow not found';
            } else if (!flow.is_active) {
              console.warn(`[${runId}] Flow ${flow.name} is not active`);
              flowError = 'Flow is inactive';
            } else {
              // 4. Create flow session and trigger
              const nowIso = new Date().toISOString();
              const startNodeId = pickStartNodeId(flow.nodes);

              const baseVariables = {
                lastMessage: "",
                contactName: contact.name || contact.phone,
                nome: body.client_name || contact.name || clientPhone,
                telefone: clientPhone,
                status_carrinho: body.cart_status || '',
                produto: body.products?.main?.[0]?.product_name || '',
                checkout_url: body.checkout_url || '',
                oferta: body.sale_name || body.offer_name || '',
                _sent_node_ids: [] as string[],
                _triggered_by: "logzz_cart_webhook",
                _logzz_cart_id: insertedCart.id,
              };

              console.log(`[${runId}] Creating flow session with variables:`, JSON.stringify(baseVariables));

              // Upsert the session
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

                // 5. Trigger flow processing asynchronously
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
      if (!clientPhone) {
        console.log(`[${runId}] No valid client phone to trigger flow`);
      }
    }

    console.log(`[${runId}] === WEBHOOK-LOGZZ-CART END ===`);

    return new Response(JSON.stringify({ 
      success: true, 
      cart_abandonment_id: insertedCart.id,
      flow_triggered: flowTriggered,
      flow_error: flowError,
      message: 'Cart abandonment received successfully' 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error(`[${runId}] Error in webhook-logzz-cart:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
