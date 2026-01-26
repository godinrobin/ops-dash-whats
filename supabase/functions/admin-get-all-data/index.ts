import { createClient } from 'npm:@supabase/supabase-js@2'
import { decode } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    })

    // Verificar se o usuário é admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    // Decode the JWT to get the user ID
    let userId: string
    try {
      const [_header, payload, _signature] = decode(token)
      userId = (payload as any).sub
      console.log('Decoded JWT - userId:', userId)
      
      if (!userId) {
        throw new Error('No user ID in token')
      }
    } catch (decodeError) {
      console.log('Failed to decode JWT:', decodeError)
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verificar se é admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle()

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Buscar todos os usuários com paginação
    let allAuthUsers: any[] = []
    let page = 1
    const perPage = 1000
    
    while (true) {
      const { data: pageData, error: authError } = await supabaseClient.auth.admin.listUsers({
        page: page,
        perPage: perPage
      })
      
      if (authError) {
        console.error('Erro ao buscar usuários:', authError)
        return new Response(
          JSON.stringify({ error: 'Erro ao buscar usuários' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }
      
      if (!pageData.users || pageData.users.length === 0) break
      
      allAuthUsers = [...allAuthUsers, ...pageData.users]
      
      // If we got fewer users than perPage, we've reached the end
      if (pageData.users.length < perPage) break
      
      page++
    }
    
    const authUsers = { users: allAuthUsers }

    // Buscar perfis
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('id, username')

    // Buscar todas as métricas com dados completos
    const { data: metricsData } = await supabaseClient
      .from('metrics')
      .select(`
        id,
        product_id,
        product_name,
        date,
        invested,
        leads,
        pix_count,
        pix_total,
        cpl,
        conversion,
        result,
        roas,
        structure,
        products!inner(user_id)
      `)
      .order('date', { ascending: false })
    
    // Calcular total investido por usuário e mapear métricas
    const userTotals: Record<string, number> = {}
    const metrics = metricsData?.map((m: any) => {
      const metricUserId = m.products?.user_id
      if (metricUserId) {
        userTotals[metricUserId] = (userTotals[metricUserId] || 0) + (m.invested || 0)
      }
      return {
        id: m.id,
        product_id: m.product_id,
        product_name: m.product_name,
        user_id: metricUserId,
        date: m.date,
        invested: m.invested,
        leads: m.leads,
        pix_count: m.pix_count,
        pix_total: m.pix_total,
        cpl: m.cpl,
        conversion: m.conversion,
        result: m.result,
        roas: m.roas,
        structure: m.structure,
      }
    }) || []

    // Mapear usuários com emails e totais investidos
    const users = authUsers.users.map(authUser => {
      const profile = profiles?.find(p => p.id === authUser.id)
      return {
        id: authUser.id,
        email: authUser.email || 'N/A',
        username: profile?.username || 'N/A',
        totalInvested: userTotals[authUser.id] || 0,
      }
    })

    // Buscar números organizados
    const { data: numbersData } = await supabaseClient
      .from('organized_numbers')
      .select('id, numero, celular, status, operacao, user_id')

    const numbers = numbersData?.map(num => {
      const authUser = authUsers.users.find(u => u.id === num.user_id)
      return {
        id: num.id,
        user_id: num.user_id,
        user_email: authUser?.email || 'N/A',
        numero: num.numero,
        celular: num.celular,
        status: num.status,
        operacao: num.operacao,
      }
    }) || []

    // Buscar produtos
    const { data: productsData } = await supabaseClient
      .from('products')
      .select('id, name, last_update, user_id')

    const products = productsData?.map(prod => {
      const authUser = authUsers.users.find(u => u.id === prod.user_id)
      return {
        id: prod.id,
        user_id: prod.user_id,
        user_email: authUser?.email || 'N/A',
        product_name: prod.name,
        last_update: prod.last_update,
      }
    }) || []

    // Buscar ofertas com admin_status
    const { data: offersData } = await supabaseClient
      .from('tracked_offers')
      .select('id, name, ad_library_link, user_id, admin_status, created_at')
      .order('created_at', { ascending: false })

    const offers = offersData?.map(offer => {
      const authUser = authUsers.users.find(u => u.id === offer.user_id)
      return {
        id: offer.id,
        user_email: authUser?.email || 'N/A',
        name: offer.name,
        ad_library_link: offer.ad_library_link,
        admin_status: offer.admin_status,
        created_at: offer.created_at,
      }
    }) || []

    // Buscar atividades dos usuários
    const { data: activitiesData } = await supabaseClient
      .from('user_activities')
      .select('id, user_id, activity_type, activity_name, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    const activities = activitiesData?.map(activity => {
      const authUser = authUsers.users.find(u => u.id === activity.user_id)
      const profile = profiles?.find(p => p.id === activity.user_id)
      return {
        id: activity.id,
        user_id: activity.user_id,
        user_email: authUser?.email || 'N/A',
        username: profile?.username || 'N/A',
        activity_type: activity.activity_type,
        activity_name: activity.activity_name,
        created_at: activity.created_at,
      }
    }) || []

    // Buscar instâncias do maturador - apenas as que têm uazapi_token (são da UAZAPI)
    // OBS: existem casos de duplicidade no banco (mesmo instance_name repetido).
    // Para o admin, retornamos apenas 1 registro por instance_name (o melhor candidato),
    // e também filtramos apenas os nomes que de fato existem na UAZAPI (fonte de verdade).

    // Buscar lista real de instâncias na UAZAPI (se configurado)
    // Se falhar, uazapiNameSet permanece null e NÃO filtramos (fallback para mostrar tudo do banco)
    let uazapiNameSet: Set<string> | null = null;
    try {
      const { data: config } = await supabaseClient
        .from('whatsapp_api_config')
        .select('uazapi_base_url, uazapi_api_token')
        .maybeSingle();

      console.log('[admin-get-all-data] UAZAPI config found:', !!config?.uazapi_base_url, !!config?.uazapi_api_token);

      if (config?.uazapi_base_url && config?.uazapi_api_token) {
        const baseUrl = (config.uazapi_base_url as string).replace(/\/$/, '');
        const adminToken = config.uazapi_api_token as string;

        console.log('[admin-get-all-data] Fetching UAZAPI instances from:', baseUrl);

        const uazapiResp = await fetch(`${baseUrl}/instance/all`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'admintoken': adminToken,
          },
        });

        console.log('[admin-get-all-data] UAZAPI response status:', uazapiResp.status);

        if (uazapiResp.ok) {
          const uazapiInstances = await uazapiResp.json();
          console.log('[admin-get-all-data] UAZAPI returned', Array.isArray(uazapiInstances) ? uazapiInstances.length : 0, 'instances');
          
          // Log sample for debugging
          if (Array.isArray(uazapiInstances) && uazapiInstances.length > 0) {
            console.log('[admin-get-all-data] Sample UAZAPI instance:', JSON.stringify(uazapiInstances[0]));
          }
          
          // Only set the filter if we got a non-empty array with valid instance names
          // UAZAPI uses "name" field for the instance name (not "instance")
          if (Array.isArray(uazapiInstances) && uazapiInstances.length > 0) {
            const names = uazapiInstances
              .map((i: any) => (i?.name ?? i?.instance ?? '').toString().toLowerCase().trim())
              .filter(Boolean);
            
            console.log('[admin-get-all-data] Extracted', names.length, 'instance names. Sample:', names.slice(0, 3));
            
            if (names.length > 0) {
              uazapiNameSet = new Set(names);
              console.log('[admin-get-all-data] uazapiNameSet size:', uazapiNameSet.size);
            } else {
              console.warn('[admin-get-all-data] No valid instance names found in UAZAPI response, skipping filter');
            }
          } else {
            console.warn('[admin-get-all-data] UAZAPI returned empty array, skipping filter');
          }
        } else {
          const errTxt = await uazapiResp.text();
          console.warn('[admin-get-all-data] UAZAPI list failed:', uazapiResp.status, errTxt);
        }
      }
    } catch (e) {
      console.warn('[admin-get-all-data] Failed to fetch UAZAPI instances list:', e);
    }
    
    console.log('[admin-get-all-data] Will filter by UAZAPI:', uazapiNameSet !== null);

    const { data: instancesData } = await supabaseClient
      .from('maturador_instances')
      .select('*')
      .not('uazapi_token', 'is', null)
      .order('created_at', { ascending: false })

    const pickBestInstance = (a: any, b: any) => {
      const isConnected = (s: string | null | undefined) => s === 'connected' || s === 'open';
      const aConnected = isConnected(a?.status);
      const bConnected = isConnected(b?.status);

      // Prefer a connected/open record
      if (aConnected && !bConnected) return a;
      if (!aConnected && bConnected) return b;

      // Prefer most recently connected_at when both connected
      const aConn = a?.connected_at ? Date.parse(a.connected_at) : 0;
      const bConn = b?.connected_at ? Date.parse(b.connected_at) : 0;
      if (aConnected && bConnected && aConn !== bConn) return aConn > bConn ? a : b;

      // Otherwise prefer latest created_at
      const aCreated = a?.created_at ? Date.parse(a.created_at) : 0;
      const bCreated = b?.created_at ? Date.parse(b.created_at) : 0;
      return aCreated >= bCreated ? a : b;
    };

    // Create a map of DB instances by normalized name
    const dbInstancesByName = new Map<string, any>();
    for (const inst of instancesData ?? []) {
      const key = (inst.instance_name ?? '').toLowerCase().trim();
      if (!key) continue;
      const existing = dbInstancesByName.get(key);
      dbInstancesByName.set(key, existing ? pickBestInstance(existing, inst) : inst);
    }

    // Now build the final list: start with ALL UAZAPI instances
    const instances: any[] = [];
    
    if (uazapiNameSet && uazapiNameSet.size > 0) {
      // We have UAZAPI data - use it as source of truth
      // First, get the full UAZAPI instances list again for status info
      let uazapiInstancesMap = new Map<string, any>();
      try {
        const { data: config } = await supabaseClient
          .from('whatsapp_api_config')
          .select('uazapi_base_url, uazapi_api_token')
          .maybeSingle();
        
        if (config?.uazapi_base_url && config?.uazapi_api_token) {
          const baseUrl = (config.uazapi_base_url as string).replace(/\/$/, '');
          const adminToken = config.uazapi_api_token as string;
          
          const uazapiResp = await fetch(`${baseUrl}/instance/all`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'admintoken': adminToken,
            },
          });
          
          if (uazapiResp.ok) {
            const uazapiList = await uazapiResp.json();
            if (Array.isArray(uazapiList)) {
              for (const u of uazapiList) {
                const name = (u?.name ?? u?.instance ?? '').toString().toLowerCase().trim();
                if (name) uazapiInstancesMap.set(name, u);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[admin-get-all-data] Failed to re-fetch UAZAPI for status:', e);
      }

      // Iterate over all UAZAPI instances
      for (const [uazapiName, uazapiInst] of uazapiInstancesMap) {
        const dbInst = dbInstancesByName.get(uazapiName);
        
        // Map UAZAPI status
        const uazapiStatus = (uazapiInst?.status ?? '').toLowerCase();
        let mappedStatus = 'disconnected';
        if (uazapiStatus === 'open' || uazapiStatus === 'connected') {
          mappedStatus = 'connected';
        } else if (uazapiStatus === 'connecting' || uazapiStatus === 'qrcode') {
          mappedStatus = 'connecting';
        }
        
        // Extract phone from UAZAPI
        let phoneNumber = uazapiInst?.number;
        if (!phoneNumber && uazapiInst?.me?.number) {
          phoneNumber = uazapiInst.me.number;
        }
        if (!phoneNumber && uazapiInst?.me?.id) {
          const jid = uazapiInst.me.id;
          const match = jid.match(/^(\d+)@/);
          if (match) phoneNumber = match[1];
        }

        if (dbInst) {
          // We have a DB record - use combined data
          const authUser = authUsers.users.find(u => u.id === dbInst.user_id);
          const profile = profiles?.find(p => p.id === dbInst.user_id);
          instances.push({
            id: dbInst.id,
            user_id: dbInst.user_id,
            user_email: authUser?.email || 'N/A',
            username: profile?.username || 'N/A',
            instance_name: dbInst.instance_name,
            phone_number: phoneNumber || dbInst.phone_number,
            label: dbInst.label,
            status: mappedStatus, // Use UAZAPI status as source of truth
            conversation_count: dbInst.conversation_count || 0,
            last_conversation_sync: dbInst.last_conversation_sync,
            created_at: dbInst.created_at,
            connected_at: dbInst.connected_at,
            disconnected_at: dbInst.disconnected_at,
          });
        } else {
          // No DB record - this is an orphan instance in UAZAPI
          instances.push({
            id: null,
            user_id: null,
            user_email: '⚠️ Sem usuário',
            username: '⚠️ Órfã na UAZAPI',
            instance_name: uazapiInst?.name ?? uazapiInst?.instance ?? uazapiName,
            phone_number: phoneNumber || null,
            label: null,
            status: mappedStatus,
            conversation_count: 0,
            last_conversation_sync: null,
            created_at: null,
            connected_at: null,
            disconnected_at: null,
          });
        }
      }
    } else {
      // Fallback: no UAZAPI data, show all DB instances
      for (const [, inst] of dbInstancesByName) {
        const authUser = authUsers.users.find(u => u.id === inst.user_id);
        const profile = profiles?.find(p => p.id === inst.user_id);
        instances.push({
          id: inst.id,
          user_id: inst.user_id,
          user_email: authUser?.email || 'N/A',
          username: profile?.username || 'N/A',
          instance_name: inst.instance_name,
          phone_number: inst.phone_number,
          label: inst.label,
          status: inst.status,
          conversation_count: inst.conversation_count || 0,
          last_conversation_sync: inst.last_conversation_sync,
          created_at: inst.created_at,
          connected_at: inst.connected_at,
          disconnected_at: inst.disconnected_at,
        });
      }
    }
    
    console.log('[admin-get-all-data] Final instances count:', instances.length);

    return new Response(
      JSON.stringify({
        users,
        numbers,
        products,
        offers,
        metrics,
        activities,
        instances,
        instancesCount: instances.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro:', error)
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
