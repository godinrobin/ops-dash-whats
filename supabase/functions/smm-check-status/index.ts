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

    console.log(`Checking status for SMM order ${smmOrderId}`);

    // Get status from SMM Raja API
    const statusResponse = await fetch('https://www.smmraja.com/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: smmApiKey,
        action: 'status',
        order: smmOrderId,
      }),
    });

    const statusResult = await statusResponse.json();
    console.log('SMM Raja status result:', statusResult);

    if (statusResult.error) {
      throw new Error(statusResult.error);
    }

    // Map status to Portuguese
    const statusMap: Record<string, string> = {
      'Pending': 'pendente',
      'In progress': 'processando',
      'Completed': 'concluído',
      'Partial': 'parcial',
      'Canceled': 'cancelado',
      'Refunded': 'reembolsado',
      'Processing': 'processando',
    };

    const mappedStatus = statusMap[statusResult.status] || statusResult.status.toLowerCase();

    // Update order in database
    await supabase
      .from('smm_orders')
      .update({
        status: mappedStatus,
        start_count: statusResult.start_count ? parseInt(statusResult.start_count) : null,
        remains: statusResult.remains ? parseInt(statusResult.remains) : null,
      })
      .eq('id', orderId)
      .eq('user_id', user.id);

    return new Response(JSON.stringify({
      success: true,
      status: mappedStatus,
      charge: statusResult.charge,
      startCount: statusResult.start_count,
      remains: statusResult.remains,
      currency: statusResult.currency,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error checking SMM order status:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Unknown error',
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
