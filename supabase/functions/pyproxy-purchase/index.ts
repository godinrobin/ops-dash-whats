import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PyProxyResponse {
  code: number;
  msg: string;
  data?: {
    sub_user_no?: string;
    proxy_address?: string;
    username?: string;
    password?: string;
    [key: string]: unknown;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const pyproxyApiKey = Deno.env.get('PYPROXY_API_KEY');
    const pyproxyApiSecret = Deno.env.get('PYPROXY_API_SECRET');

    if (!pyproxyApiKey || !pyproxyApiSecret) {
      console.error('PYPROXY credentials not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Credenciais PYPROXY não configuradas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, orderId } = await req.json();

    // Log the action
    const logAction = async (status: string, message: string, apiResponse?: unknown) => {
      await supabaseAdmin.from('proxy_logs').insert({
        user_id: user.id,
        order_id: orderId || null,
        action: action || 'unknown',
        status,
        message,
        api_response: apiResponse || null
      });
    };

    if (action === 'purchase') {
      // Get product price and margin
      const { data: marginData } = await supabaseAdmin
        .from('platform_margins')
        .select('margin_percent')
        .eq('system_name', 'proxy')
        .single();

      const marginPercent = marginData?.margin_percent || 50;
      
      // Base cost: ~$0.4-0.8 per GB, we use 1 GB
      // Let's use $0.60 as base cost (average)
      const baseCostUSD = 0.60;
      const exchangeRate = 5.5; // BRL/USD approximate
      const baseCostBRL = baseCostUSD * exchangeRate;
      const finalPrice = baseCostBRL * (1 + marginPercent / 100);

      // Check user balance
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from('sms_user_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (walletError || !wallet) {
        await logAction('error', 'Carteira não encontrada');
        return new Response(
          JSON.stringify({ success: false, error: 'Carteira não encontrada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (Number(wallet.balance) < finalPrice) {
        await logAction('error', `Saldo insuficiente. Necessário: R$ ${finalPrice.toFixed(2)}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Saldo insuficiente',
            required: finalPrice,
            balance: Number(wallet.balance)
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create proxy order first
      const { data: order, error: orderError } = await supabaseAdmin
        .from('proxy_orders')
        .insert({
          user_id: user.id,
          status: 'pending'
        })
        .select()
        .single();

      if (orderError) {
        await logAction('error', 'Erro ao criar pedido', orderError);
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao criar pedido' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Creating proxy order:', order.id);

      // Call PYPROXY API to create sub-user with 1GB traffic
      // API Documentation: https://www.pyproxy.com/PYPROXY-api-document.html
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      // Generate signature (simplified - adjust based on actual API requirements)
      const signaturePayload = `${pyproxyApiKey}${timestamp}${pyproxyApiSecret}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(signaturePayload);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      try {
        // PYPROXY API call to create sub-user
        const pyproxyResponse = await fetch('https://api.pyproxy.com/api/v1/sub-user/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Api-Key': pyproxyApiKey,
            'Timestamp': timestamp,
            'Signature': signature
          },
          body: JSON.stringify({
            traffic_amount: 1, // 1 GB
            traffic_unit: 'GB',
            product_type: 'residential', // Residential/ISP Rotating
            validity_days: 30 // Monthly
          })
        });

        const pyproxyData: PyProxyResponse = await pyproxyResponse.json();
        console.log('PYPROXY API Response:', pyproxyData);

        if (pyproxyData.code !== 0 || !pyproxyData.data) {
          await logAction('error', 'Erro na API PYPROXY', pyproxyData);
          
          // Rollback: delete the pending order
          await supabaseAdmin.from('proxy_orders').delete().eq('id', order.id);
          
          return new Response(
            JSON.stringify({ success: false, error: 'Erro ao provisionar proxy' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Parse proxy credentials from response
        // Format may vary - adjust based on actual API response
        const proxyAddress = pyproxyData.data.proxy_address || '';
        const [host, port] = proxyAddress.split(':');
        const username = pyproxyData.data.username || '';
        const password = pyproxyData.data.password || '';

        // Update order with credentials
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

        await supabaseAdmin
          .from('proxy_orders')
          .update({
            pyproxy_subuser_id: pyproxyData.data.sub_user_no,
            host,
            port,
            username,
            password,
            status: 'active',
            expires_at: expiresAt.toISOString()
          })
          .eq('id', order.id);

        // Deduct balance
        await supabaseAdmin
          .from('sms_user_wallets')
          .update({ balance: Number(wallet.balance) - finalPrice })
          .eq('user_id', user.id);

        // Record transaction
        await supabaseAdmin
          .from('sms_transactions')
          .insert({
            user_id: user.id,
            type: 'purchase',
            amount: -finalPrice,
            description: 'Proxy Otimizado para WhatsApp (Evolution API)'
          });

        await logAction('success', 'Proxy provisionado com sucesso', pyproxyData);

        return new Response(
          JSON.stringify({ 
            success: true, 
            order: {
              id: order.id,
              host,
              port,
              username,
              password,
              expires_at: expiresAt.toISOString(),
              status: 'active'
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (apiError) {
        console.error('PYPROXY API Error:', apiError);
        await logAction('error', 'Erro de conexão com PYPROXY', { error: String(apiError) });
        
        // Rollback: delete the pending order
        await supabaseAdmin.from('proxy_orders').delete().eq('id', order.id);
        
        return new Response(
          JSON.stringify({ success: false, error: 'Erro de conexão com fornecedor' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

    } else if (action === 'get-price') {
      // Get product price for display
      const { data: marginData } = await supabaseAdmin
        .from('platform_margins')
        .select('margin_percent')
        .eq('system_name', 'proxy')
        .single();

      const marginPercent = marginData?.margin_percent || 50;
      const baseCostUSD = 0.60;
      const exchangeRate = 5.5;
      const baseCostBRL = baseCostUSD * exchangeRate;
      const finalPrice = baseCostBRL * (1 + marginPercent / 100);

      return new Response(
        JSON.stringify({ success: true, price: finalPrice }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'get-orders') {
      // Get user's proxy orders
      const { data: orders, error } = await supabaseAdmin
        .from('proxy_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao buscar pedidos' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, orders }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'get-balance') {
      // Get PYPROXY wallet balance (admin only)
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Acesso negado' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signaturePayload = `${pyproxyApiKey}${timestamp}${pyproxyApiSecret}`;
      const encoder = new TextEncoder();
      const signData = encoder.encode(signaturePayload);
      const hashBuffer = await crypto.subtle.digest('SHA-256', signData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      try {
        const response = await fetch('https://api.pyproxy.com/api/v1/user/balance', {
          method: 'GET',
          headers: {
            'Api-Key': pyproxyApiKey,
            'Timestamp': timestamp,
            'Signature': signature
          }
        });

        const balanceData = await response.json();
        return new Response(
          JSON.stringify({ success: true, balance: balanceData }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao buscar saldo PYPROXY' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

    } else if (action === 'admin-get-logs') {
      // Get all proxy logs (admin only)
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Acesso negado' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: logs, error } = await supabaseAdmin
        .from('proxy_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      return new Response(
        JSON.stringify({ success: true, logs: logs || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'admin-get-orders') {
      // Get all proxy orders (admin only)
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Acesso negado' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: orders, error } = await supabaseAdmin
        .from('proxy_orders')
        .select('*')
        .order('created_at', { ascending: false });

      return new Response(
        JSON.stringify({ success: true, orders: orders || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'admin-suspend') {
      // Suspend a proxy (admin only)
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Acesso negado' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabaseAdmin
        .from('proxy_orders')
        .update({ status: 'suspended' })
        .eq('id', orderId);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao suspender proxy' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAction('success', 'Proxy suspenso por admin');

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Ação inválida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in pyproxy-purchase:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
