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

    const { contactId } = await req.json()
    
    if (!contactId) {
      return new Response(
        JSON.stringify({ error: 'ID do contato não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`Fetching profile pic for contact: ${contactId}`)

    // Get contact with instance info
    const { data: contact, error: contactError } = await supabaseClient
      .from('inbox_contacts')
      .select('id, phone, remote_jid, instance_id, profile_pic_url')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single()

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: 'Contato não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (!contact.instance_id) {
      return new Response(
        JSON.stringify({ error: 'Contato sem instância associada', profilePicUrl: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get instance token
    const { data: instance, error: instanceError } = await supabaseClient
      .from('maturador_instances')
      .select('id, uazapi_token')
      .eq('id', contact.instance_id)
      .single()

    if (instanceError || !instance?.uazapi_token) {
      return new Response(
        JSON.stringify({ error: 'Instância não encontrada ou sem token', profilePicUrl: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build the remote_jid if not present
    const remoteJid = contact.remote_jid || `${contact.phone}@s.whatsapp.net`
    // Also try without @s.whatsapp.net suffix
    const phoneOnly = contact.phone
    
    console.log(`Fetching profile picture from UazAPI for ${remoteJid}`)

    // Try GET method first (some versions of UazAPI use GET)
    let response = await fetch(`${UAZAPI_BASE_URL}/chat/getProfilePicture?number=${encodeURIComponent(phoneOnly)}`, {
      method: 'GET',
      headers: {
        'token': instance.uazapi_token,
      },
    })

    // If GET fails with 405, try POST
    if (response.status === 405) {
      console.log('GET returned 405, trying POST...')
      response = await fetch(`${UAZAPI_BASE_URL}/chat/getProfilePicture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': instance.uazapi_token,
        },
        body: JSON.stringify({
          number: phoneOnly,
        }),
      })
    }

    const responseText = await response.text()
    console.log(`UazAPI response status: ${response.status}, body: ${responseText}`)

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao buscar foto de perfil', 
          details: responseText,
          profilePicUrl: null 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let data
    try {
      data = JSON.parse(responseText)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Resposta inválida da API', profilePicUrl: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract profile picture URL - try different possible response formats
    const profilePicUrl = data.profilePictureUrl || data.profilePicUrl || data.picture || data.url || data.imgUrl || null

    console.log(`Profile pic URL found: ${profilePicUrl ? 'yes' : 'no'}`)

    // Update contact in database if we got a new URL
    if (profilePicUrl && profilePicUrl !== contact.profile_pic_url) {
      const { error: updateError } = await supabaseClient
        .from('inbox_contacts')
        .update({ profile_pic_url: profilePicUrl })
        .eq('id', contactId)

      if (updateError) {
        console.error('Error updating contact profile pic:', updateError)
      } else {
        console.log(`Updated profile pic for contact ${contactId}`)
      }
    }

    return new Response(
      JSON.stringify({ 
        profilePicUrl,
        updated: profilePicUrl && profilePicUrl !== contact.profile_pic_url 
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
