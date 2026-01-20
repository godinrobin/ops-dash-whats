import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UAZAPI_BASE_URL = 'https://zapdata.uazapi.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { instanceIds } = await req.json()
    
    if (!instanceIds || !Array.isArray(instanceIds) || instanceIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'IDs de instâncias não fornecidos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`Fetching profiles for ${instanceIds.length} instances`)

    // Get instances with their tokens
    const { data: instances, error: fetchError } = await supabaseClient
      .from('maturador_instances')
      .select('id, uazapi_token, instance_name')
      .in('id', instanceIds)
      .eq('user_id', user.id)
      .not('uazapi_token', 'is', null)

    if (fetchError) throw fetchError

    if (!instances || instances.length === 0) {
      return new Response(
        JSON.stringify({ profiles: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch profile info from UazAPI for each instance
    const profilePromises = instances.map(async (inst) => {
      try {
        const response = await fetch(`${UAZAPI_BASE_URL}/instance/status`, {
          method: 'GET',
          headers: {
            'token': inst.uazapi_token,
          },
        })

        if (response.ok) {
          const data = await response.json()
          console.log(`Profile for ${inst.instance_name}: name=${data.instance?.profileName}, pic=${data.instance?.profilePicUrl ? 'yes' : 'no'}`)
          return {
            id: inst.id,
            profileName: data.instance?.profileName || null,
            profilePicUrl: data.instance?.profilePicUrl || null,
          }
        } else {
          console.error(`Error fetching profile for ${inst.instance_name}: ${response.status}`)
        }
      } catch (error) {
        console.error(`Error fetching profile for ${inst.instance_name}:`, error)
      }

      return {
        id: inst.id,
        profileName: null,
        profilePicUrl: null,
      }
    })

    const profiles = await Promise.all(profilePromises)

    return new Response(
      JSON.stringify({ profiles }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
