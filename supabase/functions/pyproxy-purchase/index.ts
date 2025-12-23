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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, orderId } = await req.json();
    console.log('pyproxy-purchase action:', action);

    // get-price is public - no auth required
    if (action === 'get-price') {
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

      console.log('Price calculated:', finalPrice);
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

        const userForm = new FormData();
        userForm.append('username', username);
        userForm.append('password', password);
        userForm.append('status', '1');
        userForm.append('limit_flow', '1');
        userForm.append('remark', `lovable:${order.id}`);

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

        // (3) Get proxy host/port (some accounts require user created first)
        const hostForm = new FormData();
        hostForm.append('proxy_type', 'other');
        hostForm.append('username', username);
        const hostRes = await fetch('https://api.pyproxy.com/g/open/get_user_proxy_host', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: hostForm,
        });

        const hostParsed = await parseJsonResponse(hostRes);
        console.log('PYPROXY get_user_proxy_host status:', hostRes.status);
        console.log('PYPROXY get_user_proxy_host body (first 500):', hostParsed.preview.slice(0, 500));

        const extractHostPort = (retData: any): { host?: string; port?: string } => {
          if (!retData) return {};

          // Common shapes:
          // - { list: [{ host, port }] }
          // - { host, port }
          // - "host:port"
          const fromObj = (obj: any) => {
            if (!obj || typeof obj !== 'object') return {};
            const h = obj.host ?? obj.ip ?? obj.domain ?? obj.proxy_host ?? obj.proxyHost;
            const p = obj.port ?? obj.proxy_port ?? obj.proxyPort;
            return {
              host: typeof h === 'string' ? h : undefined,
              port: typeof p === 'string' || typeof p === 'number' ? String(p) : undefined,
            };
          };

          if (typeof retData === 'string') {
            const m = retData.match(/^([^:]+):(\d+)$/);
            return m ? { host: m[1], port: m[2] } : {};
          }

          if (Array.isArray(retData)) return fromObj(retData[0]);
          if (Array.isArray(retData.list)) return fromObj(retData.list[0]);
          return fromObj(retData);
        };

        const extracted = extractHostPort(hostParsed.json?.ret_data);
        const host = extracted.host;
        const port = extracted.port;

        if (!hostRes.ok || hostParsed.json?.ret !== 0 || hostParsed.json?.code !== 1 || !host || !port) {
          await logAction('error', 'Falha ao obter host/porta', {
            status: hostRes.status,
            body: hostParsed.preview,
          });
          await supabaseAdmin.from('proxy_orders').delete().eq('id', order.id);
          return new Response(
            JSON.stringify({ success: false, error: 'Fornecedor não retornou host/porta' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update order with credentials
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
            description: 'Proxy Otimizado para WhatsApp (Evolution API)',
          });

        await logAction('success', 'Proxy provisionado com sucesso', {
          host,
          port,
          username,
        });

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
