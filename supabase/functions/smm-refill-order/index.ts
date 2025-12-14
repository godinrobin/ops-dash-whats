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

    console.log(`Requesting refill for SMM order ${smmOrderId}`);

    // Verify order belongs to user
    const { data: order, error: orderError } = await supabase
      .from('smm_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .single();

    if (orderError || !order) {
      throw new Error('Pedido não encontrado');
    }

    // Request refill from SMM Raja API
    const refillResponse = await fetch('https://www.smmraja.com/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: smmApiKey,
        action: 'refill',
        order: smmOrderId,
      }),
    });

    const refillResult = await refillResponse.json();
    console.log('SMM Raja refill result:', refillResult);

    if (refillResult.error) {
      // Translate common API errors to Portuguese
      let errorMessage = refillResult.error;
      if (refillResult.error.includes('Not authorized to refill')) {
        errorMessage = 'Este serviço não suporta refill ou o pedido não está elegível';
      } else if (refillResult.error.includes('Incorrect order')) {
        errorMessage = 'Pedido não encontrado no sistema';
      }
      throw new Error(errorMessage);
    }

    return new Response(JSON.stringify({
      success: true,
      refillId: refillResult.refill,
      message: 'Refill solicitado com sucesso',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error requesting SMM refill:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Unknown error',
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
