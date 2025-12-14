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

    const { amount } = await req.json();
    
    if (!amount || amount < 5) {
      throw new Error('Valor mínimo: R$ 5,00');
    }

    if (amount > 1000) {
      throw new Error('Valor máximo: R$ 1.000,00');
    }

    // Validate and sanitize email - Mercado Pago requires strict email format
    let userEmail = user.email?.trim().toLowerCase();
    
    console.log(`User ${user.id} email: "${userEmail}"`);
    
    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!userEmail || !emailRegex.test(userEmail)) {
      console.error(`Invalid email format: "${userEmail}"`);
      // Use a valid fallback email for payment processing
      userEmail = `user_${user.id.substring(0, 8)}@pagamento.zapdata.com.br`;
      console.log(`Using fallback email: ${userEmail}`);
    }
    
    console.log(`User ${user.id} creating PIX charge for R$ ${amount} with email: ${userEmail}`);

    // Cria pagamento PIX no Mercado Pago
    const paymentResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mercadoPagoToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${user.id}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        payment_method_id: 'pix',
        description: `Recarga Números Virtuais - R$ ${amount.toFixed(2)}`,
        payer: {
          email: userEmail,
        },
      }),
    });

    const paymentData = await paymentResponse.json();
    
    console.log('Mercado Pago response status:', paymentResponse.status);
    console.log('Mercado Pago response:', JSON.stringify(paymentData).substring(0, 500));

    if (!paymentResponse.ok) {
      console.error('Mercado Pago error:', paymentData);
      throw new Error(paymentData.message || 'Erro ao criar pagamento PIX');
    }

    const externalId = paymentData.id?.toString();
    const pixQrCode = paymentData.point_of_interaction?.transaction_data?.qr_code_base64;
    const pixCopyPaste = paymentData.point_of_interaction?.transaction_data?.qr_code;
    const expiresAt = paymentData.date_of_expiration;

    if (!pixQrCode || !pixCopyPaste) {
      console.error('Missing PIX data:', paymentData);
      throw new Error('Erro ao gerar QR Code PIX');
    }

    // Salva transação pendente no banco
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: transaction, error: insertError } = await supabase
      .from('sms_transactions')
      .insert({
        user_id: user.id,
        type: 'deposit',
        amount: amount,
        description: `Depósito PIX - R$ ${amount.toFixed(2)}`,
        status: 'pending',
        external_id: externalId,
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error saving transaction:', insertError);
      throw new Error('Erro ao salvar transação');
    }

    return new Response(JSON.stringify({
      success: true,
      transactionId: transaction.id,
      externalId,
      pixQrCode,
      pixCopyPaste,
      amount,
      expiresAt,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in sms-create-pix-charge:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
