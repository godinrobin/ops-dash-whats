import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default password for new users
const DEFAULT_PASSWORD = "123456";

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate Hubla security token
    const hublaToken = Deno.env.get("HUBLA_WEBHOOK_TOKEN");
    const requestToken = req.headers.get("x-hubla-token");

    if (!hublaToken || requestToken !== hublaToken) {
      console.error("Invalid or missing x-hubla-token");
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Token validated successfully");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body));

    // Extract email from different possible formats
    let email: string | null = null;
    let name: string | null = null;

    // Handle array format (some platforms send as array)
    const payload = Array.isArray(body) ? body[0]?.body || body[0] : body;

    // Hubla format: body.event.userEmail
    if (payload.event?.userEmail) {
      email = payload.event.userEmail;
      name = payload.event.userName || payload.event.userEmail.split("@")[0];
    }
    // Standard format
    else if (payload.email) {
      email = payload.email;
      name = payload.name || payload.email.split("@")[0];
    }
    // Kiwify format
    else if (payload.Customer?.email) {
      email = payload.Customer.email;
      name = payload.Customer.full_name || payload.Customer.email.split("@")[0];
    }
    // Hotmart format
    else if (payload.data?.buyer?.email) {
      email = payload.data.buyer.email;
      name = payload.data.buyer.name || payload.data.buyer.email.split("@")[0];
    }

    if (!email) {
      console.error("Email not found in request body");
      return new Response(
        JSON.stringify({ error: "Email não encontrado no payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize email
    email = email.toLowerCase().trim();
    console.log(`Processing webhook for email: ${email}, name: ${name}`);

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email);

    if (existingUser) {
      console.log(`User ${email} already exists, upgrading to full member`);
      
      // Update the existing user's profile to be a full member
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ is_full_member: true })
        .eq("id", existingUser.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        // Even if profile update fails, return success since user exists
      } else {
        console.log(`Successfully upgraded user ${email} to full member`);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Usuário existente atualizado para membro completo",
          user_id: existingUser.id,
          upgraded: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new user with full membership
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: name,
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`User created successfully: ${newUser.user.id}`);

    // Set the new user as a full member
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ is_full_member: true })
      .eq("id", newUser.user.id);

    if (profileError) {
      console.error("Error setting full member status:", profileError);
      // Continue anyway, the trigger might handle profile creation
    } else {
      console.log(`User ${email} set as full member`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Usuário criado com sucesso como membro completo",
        user_id: newUser.user.id,
        is_full_member: true
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
