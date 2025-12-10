import { createClient } from 'npm:@supabase/supabase-js@2'

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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    
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
    
    // Verify the JWT token by calling Supabase auth API directly
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseAnonKey,
      },
    })
    
    if (!authResponse.ok) {
      console.log('Invalid token: API returned', authResponse.status)
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }
    
    const user = await authResponse.json()
    console.log('Auth check - user:', user?.id)

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verificar se é admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
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
      const userId = m.products?.user_id
      if (userId) {
        userTotals[userId] = (userTotals[userId] || 0) + (m.invested || 0)
      }
      return {
        id: m.id,
        product_id: m.product_id,
        product_name: m.product_name,
        user_id: userId,
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

    return new Response(
      JSON.stringify({ users, numbers, products, offers, metrics }),
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
