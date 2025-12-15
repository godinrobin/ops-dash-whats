import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { action, email, password, offer_name, ad_library_link, access_token } = await req.json();

    // LOGIN ACTION
    if (action === "login") {
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Email e senha são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if email format needs conversion (legacy username support)
      const isEmail = email.includes('@') && email.includes('.');
      const loginEmail = isEmail ? email.toLowerCase().trim() : `${email.toLowerCase().trim()}@metricas.local`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) {
        console.log("Login error:", error.message);
        return new Response(
          JSON.stringify({ error: "Usuário ou senha incorretos" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          access_token: data.session?.access_token,
          user_id: data.user?.id,
          email: data.user?.email
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SAVE OFFER ACTION
    if (action === "save_offer") {
      if (!access_token) {
        return new Response(
          JSON.stringify({ error: "Token de acesso não fornecido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!offer_name || !ad_library_link) {
        return new Response(
          JSON.stringify({ error: "Nome da oferta e link são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create authenticated client
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      });

      // Get user from token
      const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
      
      if (userError || !userData.user) {
        console.log("Auth error:", userError?.message);
        return new Response(
          JSON.stringify({ error: "Sessão expirada. Faça login novamente." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = userData.user.id;

      // Check if offer already exists
      const { data: existingOffer } = await supabaseAuth
        .from("tracked_offers")
        .select("id")
        .eq("user_id", userId)
        .eq("ad_library_link", ad_library_link)
        .maybeSingle();

      if (existingOffer) {
        return new Response(
          JSON.stringify({ error: "Esta oferta já está salva no Track Ofertas" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert new offer
      const { data: newOffer, error: insertError } = await supabaseAuth
        .from("tracked_offers")
        .insert({
          user_id: userId,
          name: offer_name.trim(),
          ad_library_link: ad_library_link.trim(),
        })
        .select()
        .single();

      if (insertError) {
        console.log("Insert error:", insertError.message);
        return new Response(
          JSON.stringify({ error: "Erro ao salvar oferta" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Oferta salva com sucesso!",
          offer_id: newOffer.id
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // VERIFY TOKEN ACTION
    if (action === "verify_token") {
      if (!access_token) {
        return new Response(
          JSON.stringify({ valid: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      });

      const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
      
      if (userError || !userData.user) {
        return new Response(
          JSON.stringify({ valid: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          valid: true,
          user_id: userData.user.id,
          email: userData.user.email
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Extension auth error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
