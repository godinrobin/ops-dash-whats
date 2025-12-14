import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Taxa de conversão USD para BRL (a API retorna preços em USD)
const USD_TO_BRL = 6.10;
const PROFIT_MARGIN = 1.30; // 30% de margem

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('SMS_ACTIVATE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!apiKey) {
      throw new Error('SMS_ACTIVATE_API_KEY não configurada');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Não autorizado');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Pega o usuário do token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!
    ).auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Usuário não autenticado');
    }

    const { serviceCode, serviceName, country } = await req.json();
    const countryCode = country || '73';

    console.log(`User ${user.id} buying number for service ${serviceCode} in country ${countryCode}`);

    // Primeiro, busca o preço atual do serviço
    const priceUrl = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getPrices&country=${countryCode}&service=${serviceCode}`;
    const priceResponse = await fetch(priceUrl);
    const priceData = await priceResponse.json();
    
    let priceUsd = 0;
    if (priceData[countryCode] && priceData[countryCode][serviceCode]) {
      priceUsd = priceData[countryCode][serviceCode].cost;
    } else {
      throw new Error('Serviço não disponível neste país');
    }

    const priceBrl = Math.ceil(priceUsd * USD_TO_BRL * PROFIT_MARGIN * 100) / 100;

    // Verifica saldo do usuário
    const { data: wallet, error: walletError } = await supabase
      .from('sms_user_wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();

    if (walletError) {
      console.error('Wallet error:', walletError);
      throw new Error('Erro ao verificar saldo');
    }

    const currentBalance = wallet?.balance || 0;
    
    if (currentBalance < priceBrl) {
      return new Response(JSON.stringify({ 
        error: 'Saldo insuficiente',
        required: priceBrl,
        current: currentBalance 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Compra o número na API SMS-Activate
    const buyUrl = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getNumber&service=${serviceCode}&country=${countryCode}`;
    console.log('Buying number from SMS-Activate...');
    
    const buyResponse = await fetch(buyUrl);
    const buyResult = await buyResponse.text();
    
    console.log('Buy result:', buyResult);

    // Resposta esperada: ACCESS_NUMBER:123456:79123456789
    if (!buyResult.startsWith('ACCESS_NUMBER')) {
      if (buyResult.includes('NO_NUMBERS')) {
        throw new Error('Sem números disponíveis no momento. Tente outro país.');
      }
      if (buyResult.includes('NO_BALANCE')) {
        throw new Error('Erro interno: saldo da API insuficiente');
      }
      throw new Error(`Erro ao comprar número: ${buyResult}`);
    }

    const parts = buyResult.split(':');
    const smsActivateId = parts[1];
    const phoneNumber = parts[2];

    // Debita saldo do usuário
    const newBalance = currentBalance - priceBrl;
    
    if (wallet) {
      const { error: updateError } = await supabase
        .from('sms_user_wallets')
        .update({ balance: newBalance })
        .eq('user_id', user.id);
      
      if (updateError) {
        console.error('Error updating balance:', updateError);
        // Tenta cancelar o número
        await fetch(`https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=setStatus&status=8&id=${smsActivateId}`);
        throw new Error('Erro ao debitar saldo');
      }
    } else {
      // Cria wallet com saldo negativo (não deveria acontecer, mas...)
      const { error: insertError } = await supabase
        .from('sms_user_wallets')
        .insert({ user_id: user.id, balance: -priceBrl });
      
      if (insertError) {
        console.error('Error creating wallet:', insertError);
      }
    }

    // Cria o pedido
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutos
    
    const { data: order, error: orderError } = await supabase
      .from('sms_orders')
      .insert({
        user_id: user.id,
        sms_activate_id: smsActivateId,
        phone_number: phoneNumber,
        service_code: serviceCode,
        service_name: serviceName || serviceCode,
        country_code: countryCode,
        price: priceBrl,
        status: 'waiting_sms',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
    }

    // Registra transação
    await supabase
      .from('sms_transactions')
      .insert({
        user_id: user.id,
        type: 'purchase',
        amount: -priceBrl,
        description: `Compra de número ${serviceName || serviceCode}`,
        order_id: order?.id,
      });

    return new Response(JSON.stringify({
      success: true,
      order: {
        id: order?.id,
        smsActivateId,
        phoneNumber,
        serviceName: serviceName || serviceCode,
        price: priceBrl,
        expiresAt: expiresAt.toISOString(),
      },
      newBalance,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in sms-buy-number:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
