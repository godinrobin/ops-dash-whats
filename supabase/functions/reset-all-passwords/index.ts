import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PASSWORD = "123456";

serve(async (req: Request): Promise<Response> => {
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

    // Verify admin authorization via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
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

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all admin user IDs to exclude
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);
    
    console.log(`Found ${adminUserIds.size} admin users to exclude`);

    // Get all users
    const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      return new Response(
        JSON.stringify({ error: listError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { email: string; status: string; error?: string }[] = [];

    for (const u of allUsers.users) {
      // Skip admin users
      if (adminUserIds.has(u.id)) {
        console.log(`Skipping admin user: ${u.email}`);
        results.push({ email: u.email || u.id, status: "skipped_admin" });
        continue;
      }

      try {
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          u.id,
          { password: DEFAULT_PASSWORD }
        );

        if (updateError) {
          console.error(`Error updating ${u.email}:`, updateError);
          results.push({ email: u.email || u.id, status: "error", error: updateError.message });
        } else {
          console.log(`Password reset for: ${u.email}`);
          results.push({ email: u.email || u.id, status: "reset" });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        results.push({ email: u.email || u.id, status: "error", error: errorMsg });
      }
    }

    const reset = results.filter(r => r.status === "reset").length;
    const skipped = results.filter(r => r.status === "skipped_admin").length;
    const errors = results.filter(r => r.status === "error").length;

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: { reset, skipped_admins: skipped, errors, total: allUsers.users.length },
        results 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Reset passwords error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
