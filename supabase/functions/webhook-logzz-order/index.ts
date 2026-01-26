import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extrair token da URL
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      console.error('Missing webhook token');
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validar token e buscar user_id
    const { data: webhook, error: webhookError } = await supabase
      .from('logzz_webhooks')
      .select('user_id, is_active')
      .eq('webhook_token', token)
      .maybeSingle();

    if (webhookError || !webhook) {
      console.error('Invalid webhook token:', token);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!webhook.is_active) {
      console.error('Webhook is disabled for token:', token);
      return new Response(JSON.stringify({ error: 'Webhook disabled' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = webhook.user_id;

    // Parse payload
    const body = await req.json();
    console.log('Received Logzz order webhook for user:', userId);
    console.log('Payload:', JSON.stringify(body).substring(0, 500));

    // Extrair dados do payload Logzz
    const orderData = {
      user_id: userId,
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
      // Informações do pedido
      order_number: body.order_number || body.order_code || null,
      date_order: body.date_order ? new Date(body.date_order).toISOString() : null,
      date_order_day: body.date_order_day || null,
      date_delivery: body.date_delivery ? new Date(body.date_delivery).toISOString() : null,
      date_delivery_day: body.date_delivery_day || null,
      delivery_estimate: body.delivery_estimate || null,
      order_status: body.order_status || null,
      order_status_description: body.order_status_description || null,
      order_quantity: body.order_quantity || null,
      order_final_price: body.order_final_price || null,
      second_order: body.second_order || false,
      first_order: body.first_order || false,
      // Produtos
      products: body.products || null,
      // Informações de usuários/logística
      logistic_operator: body.logistic_operator || null,
      delivery_man: body.delivery_man || null,
      delivery_man_phone: body.delivery_man_phone || null,
      producer_name: body.producer_name || null,
      producer_email: body.producer_email || null,
      affiliate_name: body.affiliate_name || null,
      affiliate_email: body.affiliate_email || null,
      affiliate_phone: body.affiliate_phone || null,
      commission: body.commission?.toString() || null,
      producer_commission: body.producer_commission || null,
      affiliate_commission: body.affiliate_commission || null,
      // UTM
      utm_source: body.utm?.utm_source || null,
      utm_content: body.utm?.utm_content || null,
      utm_term: body.utm?.utm_term || null,
      utm_medium: body.utm?.utm_medium || null,
      utm_id: body.utm?.utm_id || null,
      utm_campaign: body.utm?.utm_campaign || null,
      // Payload original
      raw_payload: body,
      webhook_type: 'order',
    };

    // Inserir pedido
    const { data: insertedOrder, error: insertError } = await supabase
      .from('logzz_orders')
      .insert(orderData)
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting order:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to save order', details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Order saved successfully:', insertedOrder.id);

    return new Response(JSON.stringify({ 
      success: true, 
      order_id: insertedOrder.id,
      message: 'Order received successfully' 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in webhook-logzz-order:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
