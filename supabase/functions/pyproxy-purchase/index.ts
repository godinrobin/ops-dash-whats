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

interface GatewayConfig {
  plan_type: string;
  gateway_pattern: string;
  gateway_host: string;
  gateway_port: string;
  description: string;
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, orderId, quantity, planType = 'residential' } = await req.json();
    console.log('=== PYPROXY PURCHASE START ===');
    console.log('Action:', action);
    console.log('Plan type:', planType);

    // get-price is public - no auth required
    if (action === 'get-price') {
      // Now margin_percent is actually the fixed price in BRL
      const { data: marginData } = await supabaseAdmin
        .from('platform_margins')
        .select('margin_percent')
        .eq('system_name', 'proxy')
        .single();

      // margin_percent now stores the fixed price in BRL (e.g., 9.99)
      const finalPrice = marginData?.margin_percent || 9.99;

      console.log('Price (fixed BRL):', finalPrice);
      return new Response(
        JSON.stringify({ success: true, price: finalPrice }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All other actions require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pyproxyApiKey || !pyproxyApiSecret) {
      console.error('PYPROXY credentials not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Credenciais PYPROXY não configuradas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      console.log('=== PURCHASE FLOW ===');
      console.log('Requested plan type:', planType);

      // Validate plan type
      const validPlanTypes = ['residential', 'isp', 'datacenter'];
      if (!validPlanTypes.includes(planType)) {
        await logAction('error', `Tipo de plano inválido: ${planType}`);
        return new Response(
          JSON.stringify({ success: false, error: `Tipo de plano inválido: ${planType}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch gateway configuration for the plan type
      const { data: gatewayConfig, error: gatewayError } = await supabaseAdmin
        .from('proxy_gateway_config')
        .select('*')
        .eq('plan_type', planType)
        .single();

      if (gatewayError || !gatewayConfig) {
        console.error('Gateway config not found for plan type:', planType);
        await logAction('error', `Gateway não configurado para tipo: ${planType}`, gatewayError);
        return new Response(
          JSON.stringify({ success: false, error: `Gateway não configurado para tipo: ${planType}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Gateway config found:', {
        plan_type: gatewayConfig.plan_type,
        gateway_host: gatewayConfig.gateway_host,
        gateway_port: gatewayConfig.gateway_port
      });

      // Get product price (fixed BRL)
      const { data: marginData } = await supabaseAdmin
        .from('platform_margins')
        .select('margin_percent')
        .eq('system_name', 'proxy')
        .single();

      // margin_percent now stores the fixed price in BRL
      const finalPrice = marginData?.margin_percent || 9.99;

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

      // Create proxy order first with plan_type
      const { data: order, error: orderError } = await supabaseAdmin
        .from('proxy_orders')
        .insert({
          user_id: user.id,
          status: 'pending',
          plan_type: planType
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

      console.log('Order created:', order.id);

      // Provisionamento via PYPROXY (documentação)
      // 1) Token: POST https://api.pyproxy.com/g/open/get_access_token
      //    sign=sha256(access_key+access_secret+timestamp)
      // 2) Host:  POST https://api.pyproxy.com/g/open/get_user_proxy_host (proxy_type=other)
      // 3) User:  POST https://api.pyproxy.com/g/open/add_or_edit_user (Bearer)

      const timestamp = Math.floor(Date.now() / 1000).toString();

      const sha256Hex = async (input: string) => {
        const bytes = new TextEncoder().encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      };

      const parseJsonResponse = async (res: Response) => {
        const raw = await res.text();
        const preview = raw?.slice?.(0, 1000) ?? '';
        return { raw, preview, json: raw ? (JSON.parse(raw) as any) : null };
      };

      try {
        // (1) Get access token
        const sign = await sha256Hex(`${pyproxyApiKey}${pyproxyApiSecret}${timestamp}`);
        const tokenForm = new FormData();
        tokenForm.append('access_key', pyproxyApiKey);
        tokenForm.append('sign', sign);
        tokenForm.append('timestamp', timestamp);

        const tokenRes = await fetch('https://api.pyproxy.com/g/open/get_access_token', {
          method: 'POST',
          body: tokenForm,
        });

        const tokenParsed = await parseJsonResponse(tokenRes);
        console.log('PYPROXY get_access_token status:', tokenRes.status);
        console.log('PYPROXY get_access_token body (first 500):', tokenParsed.preview.slice(0, 500));

        const accessToken = tokenParsed.json?.ret_data?.access_token as string | undefined;
        if (!tokenRes.ok || tokenParsed.json?.ret !== 0 || tokenParsed.json?.code !== 1 || !accessToken) {
          await logAction('error', 'Falha ao obter access_token', {
            status: tokenRes.status,
            body: tokenParsed.preview,
          });
          await supabaseAdmin.from('proxy_orders').delete().eq('id', order.id);
          return new Response(
            JSON.stringify({ success: false, error: 'Falha ao autenticar no fornecedor' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // (2) Create user with 1GB limit_flow
        const username = `px${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const password = `pw${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

        console.log('Creating user:', username);

        const userForm = new FormData();
        userForm.append('username', username);
        userForm.append('password', password);
        userForm.append('status', '1');
        userForm.append('limit_flow', '1');
        userForm.append('remark', `lovable:${order.id}:${planType}`);

        const userRes = await fetch('https://api.pyproxy.com/g/open/add_or_edit_user', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: userForm,
        });

        const userParsed = await parseJsonResponse(userRes);
        console.log('PYPROXY add_or_edit_user status:', userRes.status);
        console.log('PYPROXY add_or_edit_user body (first 500):', userParsed.preview.slice(0, 500));

        if (!userRes.ok || userParsed.json?.ret !== 0 || userParsed.json?.code !== 1) {
          await logAction('error', 'Falha ao criar usuário no fornecedor', {
            status: userRes.status,
            body: userParsed.preview,
          });
          await supabaseAdmin.from('proxy_orders').delete().eq('id', order.id);
          return new Response(
            JSON.stringify({ success: false, error: 'Fornecedor recusou criação do usuário' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // (3) USE GATEWAY FROM CONFIG instead of API response
        // This is the KEY FIX for the "insufficient flow" error
        const host = gatewayConfig.gateway_host;
        const port = gatewayConfig.gateway_port;
        const gatewayUsed = `${host}:${port}`;

        console.log('Using gateway from config:');
        console.log('  Plan type:', planType);
        console.log('  Host:', host);
        console.log('  Port:', port);
        console.log('  Gateway used:', gatewayUsed);

        // (4) Test proxy connectivity before delivery
        console.log('Testing proxy connectivity...');
        let testResult = 'pending';
        let testIp = null;

        try {
          // Note: In Deno edge functions, we can't use proxy directly
          // Instead, we'll verify by checking if we can reach the proxy host
          // A full proxy test would require a separate service
          
          // For now, we do a simple validation that the gateway is reachable
          // The actual proxy test is done client-side or via PYPROXY API status check
          
          // Check user status via PYPROXY API
          const statusForm = new FormData();
          statusForm.append('username', username);
          
          const statusRes = await fetch('https://api.pyproxy.com/g/open/get_user_info', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: statusForm,
          });

          const statusParsed = await parseJsonResponse(statusRes);
          console.log('PYPROXY get_user_info status:', statusRes.status);
          console.log('PYPROXY get_user_info body:', statusParsed.preview.slice(0, 500));

          if (statusRes.ok && statusParsed.json?.ret === 0) {
            testResult = 'success';
            testIp = 'verified_via_api';
            console.log('Proxy user verified successfully via API');
          } else {
            console.warn('Could not verify user via API, proceeding anyway');
            testResult = 'api_unverified';
          }
        } catch (testError) {
          console.error('Proxy verification failed:', testError);
          testResult = 'verification_error';
        }

        // Update order with credentials and gateway info
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

        await supabaseAdmin
          .from('proxy_orders')
          .update({
            pyproxy_subuser_id: username,
            host,
            port,
            username,
            password,
            status: 'active',
            expires_at: expiresAt.toISOString(),
            plan_type: planType,
            gateway_used: gatewayUsed,
            test_result: testResult,
            test_ip: testIp
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
            description: `Proxy ${planType.toUpperCase()} para WhatsApp`,
          });

        await logAction('success', 'Proxy provisionado com sucesso', {
          host,
          port,
          username,
          plan_type: planType,
          gateway_used: gatewayUsed,
          test_result: testResult
        });

        console.log('=== PROXY PURCHASE COMPLETE ===');
        console.log('Order ID:', order.id);
        console.log('Plan type:', planType);
        console.log('Gateway used:', gatewayUsed);
        console.log('Test result:', testResult);

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
              status: 'active',
              plan_type: planType,
              gateway_used: gatewayUsed,
              test_result: testResult
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (apiError) {
        console.error('PYPROXY Error:', apiError);
        await logAction('error', 'Erro inesperado no provisionamento', { error: String(apiError) });

        // Rollback: delete the pending order
        await supabaseAdmin.from('proxy_orders').delete().eq('id', order.id);

        return new Response(
          JSON.stringify({ success: false, error: 'Erro de conexão com fornecedor' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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

    } else if (action === 'renew') {
      // Renew an existing proxy
      if (!orderId) {
        return new Response(
          JSON.stringify({ success: false, error: 'ID do pedido é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get the order
      const { data: existingOrder, error: orderFetchError } = await supabaseAdmin
        .from('proxy_orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderFetchError || !existingOrder) {
        await logAction('error', 'Pedido não encontrado para renovação');
        return new Response(
          JSON.stringify({ success: false, error: 'Pedido não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get price (fixed BRL)
      const { data: renewMarginData } = await supabaseAdmin
        .from('platform_margins')
        .select('margin_percent')
        .eq('system_name', 'proxy')
        .single();

      // margin_percent now stores the fixed price in BRL
      const renewFinalPrice = renewMarginData?.margin_percent || 9.99;

      // Check balance
      const { data: renewWallet, error: renewWalletError } = await supabaseAdmin
        .from('sms_user_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (renewWalletError || !renewWallet) {
        await logAction('error', 'Carteira não encontrada para renovação');
        return new Response(
          JSON.stringify({ success: false, error: 'Carteira não encontrada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (Number(renewWallet.balance) < renewFinalPrice) {
        await logAction('error', `Saldo insuficiente para renovação. Necessário: R$ ${renewFinalPrice.toFixed(2)}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Saldo insuficiente',
            required: renewFinalPrice,
            balance: Number(renewWallet.balance)
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const renewUsername = existingOrder.username || existingOrder.pyproxy_subuser_id;

      if (!renewUsername) {
        await logAction('error', 'Proxy sem username para renovação');
        return new Response(
          JSON.stringify({ success: false, error: 'Proxy inválida para renovação' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get access token
      const renewTimestamp = Math.floor(Date.now() / 1000).toString();
      const renewSha256Hex = async (input: string) => {
        const bytes = new TextEncoder().encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      };

      const renewSign = await renewSha256Hex(`${pyproxyApiKey}${pyproxyApiSecret}${renewTimestamp}`);
      const renewTokenForm = new FormData();
      renewTokenForm.append('access_key', pyproxyApiKey);
      renewTokenForm.append('sign', renewSign);
      renewTokenForm.append('timestamp', renewTimestamp);

      const renewTokenRes = await fetch('https://api.pyproxy.com/g/open/get_access_token', {
        method: 'POST',
        body: renewTokenForm,
      });

      const renewTokenData = await renewTokenRes.json();
      const renewAccessToken = renewTokenData?.ret_data?.access_token;

      if (!renewAccessToken) {
        await logAction('error', 'Falha ao obter token para renovação', renewTokenData);
        return new Response(
          JSON.stringify({ success: false, error: 'Falha ao autenticar no fornecedor' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Add 1GB to existing user
      const renewUserForm = new FormData();
      renewUserForm.append('username', renewUsername);
      renewUserForm.append('status', '1');
      renewUserForm.append('limit_flow', '1'); // Add 1GB

      const renewUserRes = await fetch('https://api.pyproxy.com/g/open/add_or_edit_user', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${renewAccessToken}`,
        },
        body: renewUserForm,
      });

      const renewUserData = await renewUserRes.json();

      if (!renewUserRes.ok || renewUserData?.ret !== 0 || renewUserData?.code !== 1) {
        await logAction('error', 'Falha ao renovar proxy no fornecedor', renewUserData);
        return new Response(
          JSON.stringify({ success: false, error: 'Fornecedor recusou renovação' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update expires_at to +30 days from now
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);

      await supabaseAdmin
        .from('proxy_orders')
        .update({
          status: 'active',
          expires_at: newExpiresAt.toISOString(),
        })
        .eq('id', orderId);

      // Deduct balance
      await supabaseAdmin
        .from('sms_user_wallets')
        .update({ balance: Number(renewWallet.balance) - renewFinalPrice })
        .eq('user_id', user.id);

      // Record transaction
      await supabaseAdmin
        .from('sms_transactions')
        .insert({
          user_id: user.id,
          type: 'purchase',
          amount: -renewFinalPrice,
          description: 'Renovação de Proxy WhatsApp',
        });

      await logAction('success', 'Proxy renovado com sucesso', { orderId, renewUsername });

      return new Response(
        JSON.stringify({
          success: true,
          expires_at: newExpiresAt.toISOString(),
        }),
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

    } else if (action === 'get-gateway-config') {
      // Get all gateway configurations (for admin UI)
      const { data: configs, error } = await supabaseAdmin
        .from('proxy_gateway_config')
        .select('*')
        .order('plan_type');

      return new Response(
        JSON.stringify({ success: true, configs: configs || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'admin-update-gateway') {
      // Update gateway configuration (admin only)
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

      const { gatewayId, gatewayHost, gatewayPort } = await req.json();

      if (!gatewayId || !gatewayHost || !gatewayPort) {
        return new Response(
          JSON.stringify({ success: false, error: 'Dados incompletos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabaseAdmin
        .from('proxy_gateway_config')
        .update({ 
          gateway_host: gatewayHost, 
          gateway_port: gatewayPort,
          updated_at: new Date().toISOString()
        })
        .eq('id', gatewayId);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao atualizar gateway' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
