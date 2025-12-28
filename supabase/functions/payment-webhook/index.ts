import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InterPayload {
  pix?: {
    valor?: number;
    pagador?: {
      nome?: string;
    };
  }[];
  valor?: number;
  pagador?: {
    nome?: string;
  };
}

interface InfinitePayPayload {
  data?: {
    attributes?: {
      amount?: number;
      payer_name?: string;
    };
  };
  amount?: number;
  payer_name?: string;
}

Deno.serve(async (req) => {
  console.log('[payment-webhook] Request received:', req.method, req.url);
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Get webhook ID from URL: /payment-webhook/{webhookId}
    const webhookId = pathParts[pathParts.length - 1];
    
    if (!webhookId || webhookId === 'payment-webhook') {
      console.log('[payment-webhook] No webhook ID provided');
      return new Response(
        JSON.stringify({ error: 'Webhook ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[payment-webhook] Processing webhook ID:', webhookId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const onesignalAppId = Deno.env.get('ONESIGNAL_APP_ID');
    const onesignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find webhook config
    const { data: webhook, error: webhookError } = await supabase
      .from('user_payment_webhooks')
      .select('*')
      .eq('webhook_id', webhookId)
      .eq('is_active', true)
      .single();

    if (webhookError || !webhook) {
      console.log('[payment-webhook] Webhook not found or inactive:', webhookId);
      return new Response(
        JSON.stringify({ error: 'Webhook not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[payment-webhook] Found webhook for user:', webhook.user_id, 'bank:', webhook.bank_type);

    // Parse payload
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    console.log('[payment-webhook] Received payload:', JSON.stringify(payload).substring(0, 500));

    // Extract amount and payer name based on bank type
    let amount = 0;
    let payerName = 'Desconhecido';

    if (webhook.bank_type === 'inter') {
      // Inter webhook format
      const interPayload = payload as InterPayload;
      if (interPayload.pix && interPayload.pix[0]) {
        amount = interPayload.pix[0].valor || 0;
        payerName = interPayload.pix[0].pagador?.nome || 'Desconhecido';
      } else {
        amount = interPayload.valor || 0;
        payerName = interPayload.pagador?.nome || 'Desconhecido';
      }
    } else if (webhook.bank_type === 'infinitepay') {
      // InfinitePay webhook format
      const infinitePayload = payload as InfinitePayPayload;
      if (infinitePayload.data?.attributes) {
        amount = (infinitePayload.data.attributes.amount || 0) / 100; // Convert from cents
        payerName = infinitePayload.data.attributes.payer_name || 'Desconhecido';
      } else {
        amount = (infinitePayload.amount || 0) / 100;
        payerName = infinitePayload.payer_name || 'Desconhecido';
      }
    }

    console.log('[payment-webhook] Extracted - Amount:', amount, 'Payer:', payerName);

    // Skip if no amount
    if (amount <= 0) {
      console.log('[payment-webhook] No valid amount, skipping notification');
      return new Response(
        JSON.stringify({ success: true, message: 'No amount detected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save notification record
    const { error: notifError } = await supabase
      .from('payment_notifications')
      .insert({
        webhook_id: webhook.id,
        user_id: webhook.user_id,
        amount,
        payer_name: payerName,
        bank_type: webhook.bank_type,
        raw_payload: payload,
        notification_sent: false
      });

    if (notifError) {
      console.error('[payment-webhook] Error saving notification:', notifError);
    }

    // Update webhook stats
    await supabase
      .from('user_payment_webhooks')
      .update({
        notifications_count: webhook.notifications_count + 1,
        total_received: Number(webhook.total_received) + amount
      })
      .eq('id', webhook.id);

    // Send push notification via OneSignal
    let notificationSent = false;
    if (onesignalAppId && onesignalApiKey) {
      try {
        console.log('[payment-webhook] Sending OneSignal notification');
        
        const notificationPayload = {
          app_id: onesignalAppId,
          filters: [
            { field: 'tag', key: 'user_id', relation: '=', value: webhook.user_id }
          ],
          headings: { en: 'Pix Pago - Zapdata' },
          contents: { en: `R$ ${amount.toFixed(2)} - ${payerName}` },
          chrome_web_icon: 'https://zapdata.co/favicon.png',
          firefox_icon: 'https://zapdata.co/favicon.png',
          small_icon: 'https://zapdata.co/favicon.png',
          large_icon: 'https://zapdata.co/favicon.png',
          data: {
            type: 'pix_payment',
            amount,
            payer_name: payerName,
            bank_type: webhook.bank_type
          }
        };

        const onesignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${onesignalApiKey}`
          },
          body: JSON.stringify(notificationPayload)
        });

        const onesignalResult = await onesignalResponse.json();
        console.log('[payment-webhook] OneSignal response:', JSON.stringify(onesignalResult));
        
        notificationSent = onesignalResponse.ok;

        // Update notification record
        if (notificationSent) {
          await supabase
            .from('payment_notifications')
            .update({ notification_sent: true })
            .eq('webhook_id', webhook.id)
            .order('created_at', { ascending: false })
            .limit(1);
        }
      } catch (notifErr) {
        console.error('[payment-webhook] OneSignal error:', notifErr);
      }
    } else {
      console.log('[payment-webhook] OneSignal credentials not configured');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        amount,
        payer_name: payerName,
        notification_sent: notificationSent 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[payment-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
