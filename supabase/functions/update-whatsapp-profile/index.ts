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

    const { action, instanceId, instances, name, imageBase64 } = await req.json()
    console.log('Update WhatsApp profile:', { action, instanceId, instancesCount: instances?.length })

    // Get instance(s) to update
    let instancesToUpdate: Array<{ id: string; uazapi_token: string; instance_name: string; phone_number: string | null }> = []

    if (action === 'bulk' && instances && instances.length > 0) {
      // Bulk update - get all instances
      const { data, error } = await supabaseClient
        .from('maturador_instances')
        .select('id, uazapi_token, instance_name, phone_number')
        .in('id', instances)
        .eq('user_id', user.id)
        .not('uazapi_token', 'is', null)

      if (error) throw error
      instancesToUpdate = data || []
    } else if (instanceId) {
      // Single instance update
      const { data, error } = await supabaseClient
        .from('maturador_instances')
        .select('id, uazapi_token, instance_name, phone_number')
        .eq('id', instanceId)
        .eq('user_id', user.id)
        .single()

      if (error) throw error
      if (data && data.uazapi_token) {
        instancesToUpdate = [data]
      }
    }

    if (instancesToUpdate.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhuma instância encontrada ou sem token de API' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const results: Array<{
      id: string
      success: boolean
      error?: string
      effectiveProfileName?: string | null
      effectiveProfilePicUrl?: string | null
    }> = []

    for (const instance of instancesToUpdate) {
      try {
        // Update name if provided
        if (name !== undefined && name !== null) {
          const nameResponse = await fetch(`${UAZAPI_BASE_URL}/profile/name`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazapi_token,
            },
            body: JSON.stringify({ name }),
          })

          if (!nameResponse.ok) {
            const errorText = await nameResponse.text()
            console.error(`Error updating name for ${instance.instance_name}:`, errorText)
            results.push({ id: instance.id, success: false, error: `Nome: ${errorText}` })
            continue
          }
        }

        // Update image if provided
        if (imageBase64 !== undefined && imageBase64 !== null) {
          const imageResponse = await fetch(`${UAZAPI_BASE_URL}/profile/image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instance.uazapi_token,
            },
            body: JSON.stringify({
              image: imageBase64 === 'remove' ? 'remove' : imageBase64
            }),
          })

          if (!imageResponse.ok) {
            const errorText = await imageResponse.text()
            console.error(`Error updating image for ${instance.instance_name}:`, errorText)
            results.push({ id: instance.id, success: false, error: `Imagem: ${errorText}` })
            continue
          }
        }

        // Fetch the effective profile from provider right after update
        let effectiveProfileName: string | null = null
        let effectiveProfilePicUrl: string | null = null

        try {
          const statusResponse = await fetch(`${UAZAPI_BASE_URL}/instance/status`, {
            method: 'GET',
            headers: {
              'token': instance.uazapi_token,
            },
          })

          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            effectiveProfileName = statusData?.instance?.profileName ?? null
            effectiveProfilePicUrl = statusData?.instance?.profilePicUrl ?? null
          }
        } catch (statusError) {
          console.error(`Error fetching updated status for ${instance.instance_name}:`, statusError)
        }

        results.push({
          id: instance.id,
          success: true,
          effectiveProfileName,
          effectiveProfilePicUrl,
        })
        console.log(`Successfully updated profile for ${instance.instance_name}`)
      } catch (error) {
        console.error(`Error updating ${instance.instance_name}:`, error)
        results.push({ id: instance.id, success: false, error: (error as Error).message })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({ 
        success: failCount === 0,
        results,
        successCount,
        failCount,
        message: failCount === 0 
          ? `${successCount} perfil(s) atualizado(s) com sucesso`
          : `${successCount} sucesso(s), ${failCount} erro(s)`
      }),
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
