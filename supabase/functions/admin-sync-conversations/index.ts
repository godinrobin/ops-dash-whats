import { createClient } from 'npm:@supabase/supabase-js@2'
import { decode } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EVOLUTION_BASE_URL = 'https://api.chatwp.xyz';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

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

    // Verify admin user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }
    
    const token = authHeader.replace('Bearer ', '')
    let userId: string
    
    try {
      const [_header, payload, _signature] = decode(token)
      userId = (payload as any).sub
      if (!userId) throw new Error('No user ID')
    } catch {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check admin role
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

    const { instanceId, syncAll } = await req.json()
    console.log('Admin sync conversations:', { instanceId, syncAll })

    const results: Array<{ id: string; count: number; error?: string }> = []

    // Get instances to sync
    let instances: Array<{ id: string; instance_name: string; user_id: string }> = []
    
    if (syncAll) {
      const { data } = await supabaseClient
        .from('maturador_instances')
        .select('id, instance_name, user_id')
        .eq('status', 'connected')
      instances = data || []
    } else if (instanceId) {
      const { data } = await supabaseClient
        .from('maturador_instances')
        .select('id, instance_name, user_id')
        .eq('id', instanceId)
        .single()
      if (data) instances = [data]
    }

    console.log(`Syncing ${instances.length} instances...`)

    for (const instance of instances) {
      try {
        // Get user's Evolution config
        const { data: config } = await supabaseClient
          .from('maturador_config')
          .select('evolution_base_url, evolution_api_key')
          .eq('user_id', instance.user_id)
          .single()

        const baseUrl = config?.evolution_base_url || EVOLUTION_BASE_URL
        const apiKey = config?.evolution_api_key || EVOLUTION_API_KEY

        // Fetch chats from Evolution API
        const response = await fetch(`${baseUrl}/chat/findChats/${instance.instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
          },
          body: JSON.stringify({}),
        })

        if (!response.ok) {
          console.error(`Error fetching chats for ${instance.instance_name}:`, await response.text())
          results.push({ id: instance.id, count: 0, error: 'API error' })
          continue
        }

        const chats = await response.json()
        const conversationCount = Array.isArray(chats) ? chats.length : 0

        console.log(`Instance ${instance.instance_name}: ${conversationCount} conversations`)

        // Update instance with conversation count
        await supabaseClient
          .from('maturador_instances')
          .update({
            conversation_count: conversationCount,
            last_conversation_sync: new Date().toISOString(),
          })
          .eq('id', instance.id)

        results.push({ id: instance.id, count: conversationCount })
      } catch (error) {
        console.error(`Error syncing ${instance.instance_name}:`, error)
        results.push({ id: instance.id, count: 0, error: (error as Error).message })
      }
    }

    // Return single instance result or all results
    if (instanceId && results.length === 1) {
      return new Response(
        JSON.stringify({ count: results[0].count, error: results[0].error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ results, total: results.length }),
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
