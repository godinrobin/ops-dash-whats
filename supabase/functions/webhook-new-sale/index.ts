import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Standard format
    if (body.email) {
      email = body.email;
      name = body.name || body.email.split("@")[0];
    }
    // Kiwify format
    else if (body.Customer?.email) {
      email = body.Customer.email;
      name = body.Customer.full_name || body.Customer.email.split("@")[0];
    }
    // Hotmart format
    else if (body.data?.buyer?.email) {
      email = body.data.buyer.email;
      name = body.data.buyer.name || body.data.buyer.email.split("@")[0];
    }

    if (!email) {
      console.error("Email not found in request body");
      return new Response(
        JSON.stringify({ error: "Email não encontrado no payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating user for email: ${email}, name: ${name}`);

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const userExists = existingUsers?.users?.some(u => u.email === email);

    if (userExists) {
      console.log(`User ${email} already exists`);
      return new Response(
        JSON.stringify({ success: true, message: "Usuário já existe" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user with password 123456
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: "123456",
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Usuário criado com sucesso",
        user_id: newUser.user.id 
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
