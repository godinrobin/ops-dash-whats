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

    // Verifica se é admin
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      throw new Error('Acesso negado: apenas administradores');
    }

    const { targetUserId, amount, description } = await req.json();

    if (!targetUserId || !amount) {
      throw new Error('targetUserId e amount são obrigatórios');
    }

    console.log(`Admin ${user.id} recharging ${amount} for user ${targetUserId}`);

    // Busca ou cria wallet do usuário alvo
    const { data: wallet, error: walletError } = await supabase
      .from('sms_user_wallets')
      .select('balance')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (walletError) {
      console.error('Wallet error:', walletError);
      throw new Error('Erro ao buscar wallet');
    }

    let newBalance: number;

    if (wallet) {
      newBalance = Number(wallet.balance) + Number(amount);
      await supabase
        .from('sms_user_wallets')
        .update({ balance: newBalance })
        .eq('user_id', targetUserId);
    } else {
      newBalance = Number(amount);
      await supabase
        .from('sms_user_wallets')
        .insert({ user_id: targetUserId, balance: newBalance });
    }

    // Registra transação
    await supabase
      .from('sms_transactions')
      .insert({
        user_id: targetUserId,
        type: 'recharge',
        amount: Number(amount),
        description: description || 'Recarga manual pelo admin',
      });

    return new Response(JSON.stringify({
      success: true,
      newBalance,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in sms-admin-recharge:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
