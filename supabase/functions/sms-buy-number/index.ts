import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Taxa de conversão USD para BRL (a API retorna preços em USD)
const USD_TO_BRL = 6.10;

async function getMarginPercent(supabase: any): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('platform_margins')
      .select('margin_percent')
      .eq('system_name', 'sms')
      .maybeSingle();

    if (error || !data?.margin_percent) {
      console.log('Using default margin (30%)');
      return 30;
    }

    return Number(data.margin_percent);
  } catch (err) {
    console.error('Error fetching margin:', err);
    return 30;
  }
}

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

    const { serviceCode, serviceName, country, quantity = 1 } = await req.json();
    const countryCode = country || '73';
    const buyQuantity = Math.min(Math.max(1, quantity), 10); // Máximo 10 por vez

    console.log(`User ${user.id} buying ${buyQuantity} number(s) for service ${serviceCode} in country ${countryCode}`);

    // Primeiro, busca o preço atual do serviço
    const priceUrl = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getPrices&country=${countryCode}&service=${serviceCode}`;
    console.log('Fetching prices from:', priceUrl.replace(apiKey, '***'));
    
    const priceResponse = await fetch(priceUrl);
    const priceText = await priceResponse.text();
    console.log('Price API response:', priceText.substring(0, 500));
    
    let priceData;
    try {
      priceData = JSON.parse(priceText);
    } catch (e) {
      console.error('Failed to parse price response:', priceText);
      throw new Error(`Erro na API de preços: ${priceText.substring(0, 100)}`);
    }
    
    let priceUsd = 0;
    let available = 0;
    if (priceData[countryCode] && priceData[countryCode][serviceCode]) {
      priceUsd = priceData[countryCode][serviceCode].cost;
      available = priceData[countryCode][serviceCode].count;
      console.log(`Price found: $${priceUsd}, Available: ${available}`);
    } else {
      console.error('Service not found in response:', JSON.stringify(priceData).substring(0, 200));
      throw new Error('Serviço não disponível neste país');
    }

    // Verifica disponibilidade
    if (available < buyQuantity) {
      // Business rule error: return 200 so the client can show a friendly message
      return new Response(JSON.stringify({
        success: false,
        error: `Apenas ${available} números disponíveis`,
        available,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Margem deve bater com a usada no sms-get-services (para preço exibido = preço cobrado)
    const marginPercent = await getMarginPercent(supabase);
    const marginMultiplier = 1 + (marginPercent / 100);

    // Preço cobrado do usuário (já com margem)
    const priceWithMarkupUnit = Math.ceil(priceUsd * USD_TO_BRL * marginMultiplier * 100) / 100;
    const totalCharge = Math.ceil(priceWithMarkupUnit * buyQuantity * 100) / 100;

    console.log(`Pricing | margin=${marginPercent}% unit=R$${priceWithMarkupUnit} total=R$${totalCharge}`);

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

    const currentBalance = Number(wallet?.balance || 0);

    console.log(`Wallet | balance=R$${currentBalance} required=R$${totalCharge}`);

    if (currentBalance < totalCharge) {
      console.log('Insufficient balance');
      // Business rule error: return 200 so the client can show a friendly message
      return new Response(JSON.stringify({
        success: false,
        error: 'Saldo insuficiente',
        required: totalCharge,
        current: currentBalance,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Compra os números na API SMS-Activate
    const purchasedNumbers = [];
    let successCount = 0;
    let totalCost = 0;

    for (let i = 0; i < buyQuantity; i++) {
      const buyUrl = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getNumber&service=${serviceCode}&country=${countryCode}`;
      console.log(`Buying number ${i + 1}/${buyQuantity} from SMS-Activate...`);
      
      const buyResponse = await fetch(buyUrl);
      const buyResult = await buyResponse.text();
      
      console.log(`Buy result ${i + 1}:`, buyResult);

      if (!buyResult.startsWith('ACCESS_NUMBER')) {
        if (buyResult.includes('NO_NUMBERS')) {
          console.log('No more numbers available, stopping purchase');
          break;
        }
        if (buyResult.includes('NO_BALANCE')) {
          console.error('API balance insufficient');
          break;
        }
        console.error(`Error buying number ${i + 1}:`, buyResult);
        continue;
      }

      const parts = buyResult.split(':');
      const smsActivateId = parts[1];
      const phoneNumber = parts[2];

      purchasedNumbers.push({ smsActivateId, phoneNumber });
      successCount++;
      totalCost += priceWithMarkupUnit;
    }

    if (successCount === 0) {
      throw new Error('Não foi possível comprar nenhum número. Tente novamente.');
    }

    // Debita saldo do usuário (apenas pelos números comprados com sucesso)
    const totalDebit = Math.ceil(totalCost * 100) / 100;
    const newBalance = currentBalance - totalDebit;
    
    if (wallet) {
      const { error: updateError } = await supabase
        .from('sms_user_wallets')
        .update({ balance: newBalance })
        .eq('user_id', user.id);
      
      if (updateError) {
        console.error('Error updating balance:', updateError);
        // Tenta cancelar os números comprados
        for (const num of purchasedNumbers) {
          await fetch(`https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=setStatus&status=8&id=${num.smsActivateId}`);
        }
        throw new Error('Erro ao debitar saldo');
      }
    } else {
      const { error: insertError } = await supabase
        .from('sms_user_wallets')
        .insert({ user_id: user.id, balance: -totalDebit });
      
      if (insertError) {
        console.error('Error creating wallet:', insertError);
      }
    }

    // Cria os pedidos
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutos
    const orders = [];

    for (const num of purchasedNumbers) {
      const { data: order, error: orderError } = await supabase
        .from('sms_orders')
        .insert({
          user_id: user.id,
          sms_activate_id: num.smsActivateId,
          phone_number: num.phoneNumber,
          service_code: serviceCode,
          service_name: serviceName || serviceCode,
          country_code: countryCode,
          price: priceWithMarkupUnit,
          status: 'waiting_sms',
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (orderError) {
        console.error('Error creating order:', orderError);
      } else {
        orders.push(order);
      }

      // Registra transação
      await supabase
        .from('sms_transactions')
        .insert({
          user_id: user.id,
          type: 'purchase',
          amount: -priceWithMarkupUnit,
          description: `Compra de número ${serviceName || serviceCode} (+${num.phoneNumber})`,
          order_id: order?.id,
        });
    }

    return new Response(JSON.stringify({
      success: true,
      purchasedCount: successCount,
      requestedCount: buyQuantity,
      orders: orders.map(o => ({
        id: o?.id,
        smsActivateId: o?.sms_activate_id,
        phoneNumber: o?.phone_number,
        serviceName: serviceName || serviceCode,
        price: priceWithMarkupUnit,
        expiresAt: expiresAt.toISOString(),
      })),
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
