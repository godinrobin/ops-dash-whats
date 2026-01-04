import { createClient } from 'npm:@supabase/supabase-js@2'
import { decode } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UAZAPI_BASE_URL = 'https://api.uazapi.com';

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

    // Get instances to sync - now including uazapi_token
    let instances: Array<{ id: string; instance_name: string; user_id: string; uazapi_token: string | null }> = []
    
    if (syncAll) {
      const { data } = await supabaseClient
        .from('maturador_instances')
        .select('id, instance_name, user_id, uazapi_token')
        .eq('status', 'connected')
      instances = data || []
    } else if (instanceId) {
      const { data } = await supabaseClient
        .from('maturador_instances')
        .select('id, instance_name, user_id, uazapi_token')
        .eq('id', instanceId)
        .single()
      if (data) instances = [data]
    }

    console.log(`Syncing ${instances.length} instances...`)

    for (const instance of instances) {
      try {
        // Skip if no uazapi_token
        if (!instance.uazapi_token) {
          console.log(`Instance ${instance.instance_name}: No uazapi_token, skipping`)
          results.push({ id: instance.id, count: 0, error: 'No API token' })
          continue
        }

        // Use Uazapi API to get chat count
        // First, try to get the chat list with pagination info
        const response = await fetch(`${UAZAPI_BASE_URL}/chat/list`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instance.uazapi_token,
          },
          body: JSON.stringify({ page: 1, pageSize: 1 }), // Just get pagination info
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Error fetching chats for ${instance.instance_name}:`, errorText)
          results.push({ id: instance.id, count: 0, error: 'API error' })
          continue
        }

        const chatsResponse = await response.json()
        
        // Uazapi returns { chats: [...], pagination: { totalRecords, ... } }
        const conversationCount = chatsResponse.pagination?.totalRecords || 
                                   (Array.isArray(chatsResponse.chats) ? chatsResponse.chats.length : 0) ||
                                   (Array.isArray(chatsResponse) ? chatsResponse.length : 0)

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
