import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Reset password function called");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify admin authorization via JWT
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    
    if (!authHeader) {
      console.log("No authorization header");
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    console.log("Auth check - user:", user?.id, "error:", authError?.message);
    
    if (authError || !user) {
      console.log("Invalid token:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    console.log("Role check - data:", roleData, "error:", roleError?.message);

    if (roleError || !roleData) {
      console.log("No admin role found");
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { email, password } = body;
    
    console.log("Request body - email:", email, "password length:", password?.length);
    
    if (!email || !password) {
      console.log("Missing email or password");
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email using pagination to handle large user lists
    console.log("Searching for user:", email);
    
    let targetUser = null;
    let page = 1;
    const perPage = 1000;
    
    while (!targetUser) {
      const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });
      
      if (listError) {
        console.log("Error listing users:", listError.message);
        return new Response(
          JSON.stringify({ error: listError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`Page ${page}: found ${usersPage.users.length} users`);
      
      targetUser = usersPage.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      
      if (usersPage.users.length < perPage) {
        break; // Last page
      }
      
      page++;
    }

    if (!targetUser) {
      console.log("User not found:", email);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found user:", targetUser.id, targetUser.email);

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      targetUser.id,
      { password }
    );

    if (updateError) {
      console.error(`Error updating password for ${email}:`, updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password reset successfully for: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Senha redefinida com sucesso para ${email}`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Reset password error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
