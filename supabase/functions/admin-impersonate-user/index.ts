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

    // Verify admin authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    // Decode JWT to get admin user ID
    let adminUserId: string
    try {
      const [_header, payload, _signature] = decode(token)
      adminUserId = (payload as any).sub
      console.log('Admin user ID:', adminUserId)
      
      if (!adminUserId) {
        throw new Error('No user ID in token')
      }
    } catch (decodeError) {
      console.log('Failed to decode JWT:', decodeError)
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verify admin role
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', adminUserId)
      .eq('role', 'admin')
      .maybeSingle()

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Apenas administradores podem usar esta função' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Get target user ID from request body
    const { userId } = await req.json()
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Generating magic link for user:', userId)

    // Get user email
    const { data: userData, error: userError } = await supabaseClient.auth.admin.getUserById(userId)
    if (userError || !userData.user) {
      console.error('Error fetching user:', userError)
      return new Response(
        JSON.stringify({ error: 'Usuário não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const userEmail = userData.user.email
    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: 'Usuário sem email' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Generate a magic link for the user
    const { data: linkData, error: linkError } = await supabaseClient.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
      options: {
        redirectTo: `${req.headers.get('origin') || supabaseUrl}`,
      },
    })

    if (linkError) {
      console.error('Error generating magic link:', linkError)
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar link de acesso: ' + linkError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Magic link generated successfully')

    // Log the impersonation for audit
    await supabaseClient
      .from('admin_role_audit_log')
      .insert({
        action: 'IMPERSONATE',
        target_user_id: userId,
        performed_by: adminUserId,
        role_affected: 'user',
        success: true,
      })

    return new Response(
      JSON.stringify({ 
        success: true, 
        actionLink: linkData.properties.action_link,
        email: userEmail,
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