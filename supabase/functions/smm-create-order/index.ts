import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USD_TO_BRL = 6.10;
const PROFIT_MARGIN = 1.30;
const PLATFORM_MARKUP = 1.10;

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

    const { serviceId, serviceName, category, link, quantity, priceUsd, priceBrl } = await req.json();

    console.log(`Creating SMM order for user ${user.id}: service ${serviceId}, qty ${quantity}`);

    // Check user wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from('sms_user_wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (walletError) {
      // Create wallet if doesn't exist
      if (walletError.code === 'PGRST116') {
        await supabase.from('sms_user_wallets').insert({ user_id: user.id, balance: 0 });
        throw new Error('Saldo insuficiente. Por favor, recarregue sua conta.');
      }
      throw new Error('Erro ao verificar saldo');
    }

    const totalCost = priceBrl;
    if (wallet.balance < totalCost) {
      throw new Error(`Saldo insuficiente. Você precisa de R$ ${totalCost.toFixed(2)} mas tem R$ ${wallet.balance.toFixed(2)}`);
    }

    // Create order in SMM Raja API
    const orderResponse = await fetch('https://www.smmraja.com/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: smmApiKey,
        action: 'add',
        service: serviceId,
        link: link,
        quantity: quantity,
      }),
    });

    const orderResult = await orderResponse.json();
    console.log('SMM Raja order result:', orderResult);

    if (orderResult.error) {
      throw new Error(orderResult.error);
    }

    // Debit user wallet
    const newBalance = wallet.balance - totalCost;
    await supabase
      .from('sms_user_wallets')
      .update({ balance: newBalance })
      .eq('user_id', user.id);

    // Create order record in database
    const { data: order, error: orderError } = await supabase
      .from('smm_orders')
      .insert({
        user_id: user.id,
        smm_raja_order_id: orderResult.order?.toString() || null,
        service_id: serviceId,
        service_name: serviceName,
        category: category,
        link: link,
        quantity: quantity,
        price_usd: priceUsd,
        price_brl: totalCost,
        status: 'pending',
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order record:', orderError);
    }

    // Create transaction record
    await supabase.from('sms_transactions').insert({
      user_id: user.id,
      type: 'smm_purchase',
      amount: -totalCost,
      description: `Compra SMM: ${serviceName} (${quantity} unidades)`,
      status: 'completed',
    });

    return new Response(JSON.stringify({
      success: true,
      order: order,
      smmOrderId: orderResult.order,
      newBalance: newBalance,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error creating SMM order:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Unknown error',
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
