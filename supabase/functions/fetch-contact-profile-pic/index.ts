import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UAZAPI_BASE_URL = 'https://zapdata.uazapi.com';

async function downloadAndUploadImage(
  supabase: any, 
  imageUrl: string, 
  contactId: string, 
  userId: string
): Promise<string | null> {
  try {
    console.log(`Downloading image from: ${imageUrl.substring(0, 100)}...`)
    
    // Download the image
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      console.error(`Failed to download image: ${imageResponse.status}`)
      return null
    }
    
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
    const imageBuffer = await imageResponse.arrayBuffer()
    
    // Determine file extension based on content type
    let extension = 'jpg'
    if (contentType.includes('png')) extension = 'png'
    else if (contentType.includes('webp')) extension = 'webp'
    
    // Create unique filename
    const timestamp = Date.now()
    const fileName = `${userId}/${contactId}_${timestamp}.${extension}`
    
    console.log(`Uploading to storage: ${fileName}`)
    
    // Upload to Supabase storage (avatars bucket)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, imageBuffer, {
        contentType,
        upsert: true,
      })
    
    if (uploadError) {
      console.error('Upload error:', uploadError)
      return null
    }
    
    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)
    
    console.log(`Uploaded successfully: ${publicUrlData.publicUrl}`)
    return publicUrlData.publicUrl
  } catch (error) {
    console.error('Error downloading/uploading image:', error)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Admin client (bypasses RLS). We still validate user JWT for normal calls.
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const isInternalServiceCall = !!token && token === supabaseServiceKey

    let callerUserId: string | null = null
    if (!isInternalServiceCall) {
      // Normal client call: validate the user's JWT
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Usuário não autenticado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        )
      }

      callerUserId = user.id
    }

    const { contactId } = await req.json()

    if (!contactId) {
      return new Response(
        JSON.stringify({ error: 'ID do contato não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`Fetching profile pic for contact: ${contactId} (${isInternalServiceCall ? 'internal' : 'user'})`)

    // Get contact with instance info
    let contactQuery = supabaseClient
      .from('inbox_contacts')
      .select('id, phone, remote_jid, instance_id, profile_pic_url, user_id')
      .eq('id', contactId)

    // When called from the app, restrict to the logged-in user.
    // When called internally (webhook), allow lookup by contactId.
    if (!isInternalServiceCall && callerUserId) {
      contactQuery = contactQuery.eq('user_id', callerUserId)
    }

    const { data: contact, error: contactError } = await contactQuery.single()

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: 'Contato não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const contactUserId = contact.user_id as string
    if (!isInternalServiceCall && callerUserId && contactUserId !== callerUserId) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
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

    const phoneOnly = contact.phone
    
    console.log(`Fetching chat details from UazAPI for ${phoneOnly}`)

    // Use /chat/details endpoint which returns image URL
    // Documentation: POST /chat/details with { number, preview: false } returns { image: "url" }
    const response = await fetch(`${UAZAPI_BASE_URL}/chat/details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': instance.uazapi_token,
      },
      body: JSON.stringify({
        number: phoneOnly,
        preview: false, // Get full resolution image
      }),
    })

    const responseText = await response.text()
    console.log(`UazAPI response status: ${response.status}, body length: ${responseText.length}`)

    if (!response.ok) {
      console.error(`UazAPI error: ${responseText}`)
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao buscar detalhes do contato', 
          details: responseText.substring(0, 200),
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

    // Extract profile picture URL from chat/details response
    // Response includes: image (full) or imagePreview (smaller)
    const whatsappImageUrl = data.image || data.imagePreview || data.wa_profilePicUrl || null

    console.log(`WhatsApp image URL found: ${whatsappImageUrl ? 'yes' : 'no'}`)

    if (!whatsappImageUrl) {
      // User might have privacy settings that hide their profile picture
      console.log('No profile picture available (might be privacy-restricted)')
      return new Response(
        JSON.stringify({ 
          profilePicUrl: null,
          updated: false,
          reason: 'Foto de perfil não disponível (pode ser restrita por privacidade)'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download the image and upload to our storage (to avoid expiring URLs)
    const permanentUrl = await downloadAndUploadImage(
      supabaseClient,
      whatsappImageUrl,
      contactId,
      contactUserId
    )

    if (!permanentUrl) {
      // If upload failed, still save the WhatsApp URL as fallback
      console.log('Failed to save to storage, using WhatsApp URL as fallback')
    }

    const finalUrl = permanentUrl || whatsappImageUrl

    // Update contact in database with the permanent URL
    const { error: updateError } = await supabaseClient
      .from('inbox_contacts')
      .update({ profile_pic_url: finalUrl })
      .eq('id', contactId)
      .eq('user_id', contactUserId)

    if (updateError) {
      console.error('Error updating contact profile pic:', updateError)
    } else {
      console.log(`Updated profile pic for contact ${contactId}`)
    }

    // Also update the contact name if available
    if (data.wa_name || data.name || data.lead_name) {
      const contactName = data.wa_name || data.name || data.lead_name
      await supabaseClient
        .from('inbox_contacts')
        .update({ name: contactName })
        .eq('id', contactId)
        .eq('user_id', contactUserId)
        .is('name', null) // Only update if name is null
    }

    return new Response(
      JSON.stringify({ 
        profilePicUrl: finalUrl,
        updated: true,
        savedToStorage: !!permanentUrl,
        contactName: data.wa_name || data.name || null,
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
