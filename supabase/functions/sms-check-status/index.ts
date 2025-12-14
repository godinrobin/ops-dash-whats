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

    console.log(`Checking status for order ${orderId}, smsActivateId: ${smsActivateId}`);

    // Verifica status na API SMS-Activate
    const statusUrl = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getStatus&id=${smsActivateId}`;
    const statusResponse = await fetch(statusUrl);
    const statusResult = await statusResponse.text();
    
    console.log('Status result:', statusResult);

    let status = 'waiting_sms';
    let smsCode = null;

    // STATUS_WAIT_CODE - aguardando código
    // STATUS_WAIT_RESEND - aguardando reenvio
    // STATUS_CANCEL - cancelado
    // STATUS_OK:codigo - código recebido
    
    if (statusResult.startsWith('STATUS_OK:')) {
      smsCode = statusResult.replace('STATUS_OK:', '');
      status = 'received';
      
      // Atualiza pedido no banco
      await supabase
        .from('sms_orders')
        .update({ 
          status: 'received',
          sms_code: smsCode,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('user_id', user.id);
        
    } else if (statusResult === 'STATUS_CANCEL') {
      status = 'cancelled';
      
      await supabase
        .from('sms_orders')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('user_id', user.id);
    }

    return new Response(JSON.stringify({
      status,
      smsCode,
      rawStatus: statusResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in sms-check-status:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
