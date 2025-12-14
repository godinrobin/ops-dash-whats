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

    const body = await req.json();
    console.log('Webhook received:', JSON.stringify(body).substring(0, 1000));

    // Mercado Pago envia diferentes tipos de notificação
    // O tipo mais comum é "payment" com action "payment.created" ou "payment.updated"
    const action = body.action;
    const dataId = body.data?.id;

    if (!dataId) {
      console.log('No data.id in webhook, ignoring');
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Busca detalhes do pagamento na API do Mercado Pago
    const mercadoPagoToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    if (!mercadoPagoToken) {
      throw new Error('MERCADO_PAGO_ACCESS_TOKEN não configurado');
    }

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: {
        'Authorization': `Bearer ${mercadoPagoToken}`,
      },
    });

    if (!paymentResponse.ok) {
      console.error('Error fetching payment:', await paymentResponse.text());
      throw new Error('Erro ao buscar detalhes do pagamento');
    }

    const paymentData = await paymentResponse.json();
    console.log('Payment data:', JSON.stringify(paymentData).substring(0, 500));

    const externalId = paymentData.id?.toString();
    const status = paymentData.status;
    const amount = paymentData.transaction_amount;

    // Busca transação pendente pelo external_id
    const { data: transaction, error: fetchError } = await supabase
      .from('sms_transactions')
      .select('*')
      .eq('external_id', externalId)
      .eq('status', 'pending')
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching transaction:', fetchError);
      throw new Error('Erro ao buscar transação');
    }

    if (!transaction) {
      console.log(`No pending transaction found for external_id: ${externalId}`);
      return new Response(JSON.stringify({ received: true, message: 'Transaction not found or already processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Se pagamento aprovado, credita saldo
    if (status === 'approved') {
      console.log(`Payment ${externalId} approved, crediting R$ ${amount} to user ${transaction.user_id}`);

      // Busca saldo atual
      const { data: wallet } = await supabase
        .from('sms_user_wallets')
        .select('balance')
        .eq('user_id', transaction.user_id)
        .maybeSingle();

      const currentBalance = wallet?.balance || 0;
      const newBalance = currentBalance + amount;

      // Atualiza ou cria wallet
      if (wallet) {
        await supabase
          .from('sms_user_wallets')
          .update({ balance: newBalance })
          .eq('user_id', transaction.user_id);
      } else {
        await supabase
          .from('sms_user_wallets')
          .insert({ user_id: transaction.user_id, balance: amount });
      }

      // Atualiza transação para completed
      await supabase
        .from('sms_transactions')
        .update({ 
          status: 'completed',
          pix_qr_code: null, // Limpa QR code após uso
          pix_copy_paste: null,
        })
        .eq('id', transaction.id);

      console.log(`User ${transaction.user_id} balance updated from ${currentBalance} to ${newBalance}`);
    } else if (status === 'cancelled' || status === 'rejected') {
      // Marca transação como falha
      await supabase
        .from('sms_transactions')
        .update({ 
          status: 'failed',
          pix_qr_code: null,
          pix_copy_paste: null,
        })
        .eq('id', transaction.id);

      console.log(`Payment ${externalId} ${status}, transaction marked as failed`);
    }

    return new Response(JSON.stringify({ received: true, status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in sms-pix-webhook:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
