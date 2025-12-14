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
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!
    ).auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Usuário não autenticado');
    }

    const { orderId, smsActivateId } = await req.json();

    console.log(`Cancelling order ${orderId}, smsActivateId: ${smsActivateId}`);

    // Busca o pedido para pegar o preço
    const { data: order, error: orderError } = await supabase
      .from('sms_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .single();

    if (orderError || !order) {
      throw new Error('Pedido não encontrado');
    }

    if (order.status === 'received') {
      throw new Error('Não é possível cancelar um pedido que já recebeu SMS');
    }

    if (order.status === 'cancelled') {
      throw new Error('Pedido já foi cancelado');
    }

    // Cancela na API SMS-Activate (status 8 = cancelar)
    const cancelUrl = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=setStatus&status=8&id=${smsActivateId}`;
    const cancelResponse = await fetch(cancelUrl);
    const cancelResult = await cancelResponse.text();
    
    console.log('Cancel result:', cancelResult);

    // Reembolsa o usuário
    const { data: wallet } = await supabase
      .from('sms_user_wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const currentBalance = wallet?.balance || 0;
    const newBalance = currentBalance + Number(order.price);

    await supabase
      .from('sms_user_wallets')
      .update({ balance: newBalance })
      .eq('user_id', user.id);

    // Atualiza o pedido
    await supabase
      .from('sms_orders')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    // Registra transação de reembolso
    await supabase
      .from('sms_transactions')
      .insert({
        user_id: user.id,
        type: 'refund',
        amount: Number(order.price),
        description: `Reembolso - ${order.service_name}`,
        order_id: orderId,
      });

    return new Response(JSON.stringify({
      success: true,
      newBalance,
      refundAmount: order.price,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in sms-cancel-order:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
