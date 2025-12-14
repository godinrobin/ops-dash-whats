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
    const smmApiKey = Deno.env.get('SMMRAJA_API_KEY');

    if (!smmApiKey) {
      throw new Error('SMMRAJA_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { orderId, smmOrderId } = await req.json();

    console.log(`Cancelling SMM order ${smmOrderId}`);

    // Get order from database
    const { data: order, error: orderError } = await supabase
      .from('smm_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .single();

    if (orderError || !order) {
      throw new Error('Pedido não encontrado');
    }

    // Cancel order in SMM Raja API
    const cancelResponse = await fetch('https://www.smmraja.com/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: smmApiKey,
        action: 'cancel',
        order: smmOrderId,
      }),
    });

    const cancelResult = await cancelResponse.json();
    console.log('SMM Raja cancel result:', cancelResult);

    if (cancelResult.error) {
      throw new Error(cancelResult.error);
    }

    // Update order status
    await supabase
      .from('smm_orders')
      .update({ status: 'cancelado' })
      .eq('id', orderId);

    // Refund user if applicable
    if (cancelResult.cancel) {
      const refundAmount = order.price_brl;
      
      // Get current wallet balance
      const { data: wallet } = await supabase
        .from('sms_user_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (wallet) {
        const newBalance = wallet.balance + refundAmount;
        await supabase
          .from('sms_user_wallets')
          .update({ balance: newBalance })
          .eq('user_id', user.id);

        // Create refund transaction
        await supabase.from('sms_transactions').insert({
          user_id: user.id,
          type: 'smm_refund',
          amount: refundAmount,
          description: `Reembolso SMM: ${order.service_name}`,
          status: 'completed',
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Pedido cancelado com sucesso',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error cancelling SMM order:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Unknown error',
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
