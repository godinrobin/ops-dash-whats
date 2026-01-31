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
    const mercadoPagoToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!mercadoPagoToken) {
      throw new Error('MERCADO_PAGO_ACCESS_TOKEN não configurado');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Não autorizado');
    }

    // Pega o usuário do token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!
    ).auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Usuário não autenticado');
    }

    const { transactionId } = await req.json();
    
    if (!transactionId) {
      throw new Error('ID da transação não informado');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Busca transação do usuário
    const { data: transaction, error: fetchError } = await supabase
      .from('sms_transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !transaction) {
      throw new Error('Transação não encontrada');
    }

    // Se já está completed ou failed, retorna status atual
    if (transaction.status !== 'pending') {
      // Busca saldo atualizado
      const { data: wallet } = await supabase
        .from('sms_user_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      return new Response(JSON.stringify({
        status: transaction.status,
        newBalance: wallet?.balance || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verifica status no Mercado Pago
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${transaction.external_id}`, {
      headers: {
        'Authorization': `Bearer ${mercadoPagoToken}`,
      },
    });

    if (!paymentResponse.ok) {
      console.error('Error fetching payment:', await paymentResponse.text());
      return new Response(JSON.stringify({ status: 'pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentData = await paymentResponse.json();
    const paymentStatus = paymentData.status;
    const amount = paymentData.transaction_amount;

    console.log(`Payment ${transaction.external_id} status: ${paymentStatus}, amount: ${amount}`);

    if (paymentStatus === 'approved') {
      // Busca saldo atual
      const { data: wallet, error: walletFetchError } = await supabase
        .from('sms_user_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletFetchError) {
        console.error('Error fetching wallet:', walletFetchError);
        throw new Error('Erro ao buscar carteira');
      }

      const currentBalance = wallet?.balance || 0;
      const newBalance = currentBalance + amount;

      console.log(`Crediting R$ ${amount} to user ${user.id}. Current: ${currentBalance}, New: ${newBalance}`);

      // Upsert atômico com verificação de sucesso
      const { error: walletError } = await supabase
        .from('sms_user_wallets')
        .upsert({
          user_id: user.id,
          balance: newBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (walletError) {
        console.error('CRITICAL: Error updating wallet:', walletError);
        // NÃO marca a transação como completed se o saldo não foi atualizado
        throw new Error('Erro crítico ao atualizar saldo');
      }

      // Somente após confirmar que o saldo foi atualizado, marca a transação como completed
      const { error: txError } = await supabase
        .from('sms_transactions')
        .update({ 
          status: 'completed',
          pix_qr_code: null,
          pix_copy_paste: null,
        })
        .eq('id', transaction.id);

      if (txError) {
        console.error('Error updating transaction status:', txError);
        // Saldo já foi creditado, isso é menos crítico
      }

      console.log(`SUCCESS: User ${user.id} balance updated from ${currentBalance} to ${newBalance}`);

      return new Response(JSON.stringify({
        status: 'completed',
        newBalance,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (paymentStatus === 'cancelled' || paymentStatus === 'rejected' || paymentStatus === 'expired') {
      await supabase
        .from('sms_transactions')
        .update({ 
          status: 'failed',
          pix_qr_code: null,
          pix_copy_paste: null,
        })
        .eq('id', transaction.id);

      return new Response(JSON.stringify({
        status: 'failed',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: 'pending' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in sms-check-payment:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
