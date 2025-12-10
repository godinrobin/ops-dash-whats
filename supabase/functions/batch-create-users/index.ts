import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { decode } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default password for new users
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
    
    // Decode the JWT to get the user ID
    let userId: string;
    try {
      const [_header, payload, _signature] = decode(token);
      userId = (payload as any).sub;
      
      if (!userId) {
        throw new Error("No user ID in token");
      }
    } catch (decodeError) {
      console.log("Failed to decode JWT:", decodeError);
      return new Response(
        JSON.stringify({ error: "Invalid token format" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      console.error("Admin role check failed:", roleError);
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { emails } = await req.json();
    
    if (!emails || !Array.isArray(emails)) {
      return new Response(
        JSON.stringify({ error: "emails (array) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove duplicates
    const uniqueEmails = [...new Set(emails.map((e: string) => e.trim().toLowerCase()))];
    
    console.log(`Processing ${uniqueEmails.length} unique emails`);

    const results: { email: string; status: string; error?: string }[] = [];

    for (const email of uniqueEmails) {
      try {
        // Check if user already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const userExists = existingUsers?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase());

        if (userExists) {
          console.log(`User ${email} already exists`);
          results.push({ email, status: "exists" });
          continue;
        }

        // Create user with default password
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: {
            username: email.split("@")[0],
          },
        });

        if (createError) {
          console.error(`Error creating user ${email}:`, createError);
          results.push({ email, status: "error", error: createError.message });
        } else {
          console.log(`User created: ${email} (${newUser.user.id})`);
          results.push({ email, status: "created" });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Error processing ${email}:`, errorMsg);
        results.push({ email, status: "error", error: errorMsg });
      }
    }

    const created = results.filter(r => r.status === "created").length;
    const existing = results.filter(r => r.status === "exists").length;
    const errors = results.filter(r => r.status === "error").length;

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: { created, existing, errors, total: uniqueEmails.length },
        results 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Batch create error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
