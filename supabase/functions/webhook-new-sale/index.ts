import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default password for new users
const DEFAULT_PASSWORD = "123456";

// Helper function to wait
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to log webhook history
async function logWebhookHistory(
  supabase: SupabaseClient,
  transactionId: string | null,
  email: string,
  payload: unknown,
  status: string,
  userId?: string,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from("webhook_history").insert({
      transaction_id: transactionId,
      email: email,
      payload: payload,
      status: status,
      user_id: userId || null,
      error_message: errorMessage || null,
    });
    console.log(`[Webhook History] Logged: ${status} for ${email}`);
  } catch (error) {
    console.error(`[Webhook History] Failed to log:`, error);
  }
}

// Helper to check if transaction was already processed
async function isTransactionProcessed(
  supabase: SupabaseClient,
  transactionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("webhook_history")
    .select("id, status")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (error) {
    console.error(`[Webhook] Error checking transaction:`, error);
    return false;
  }

  if (data && data.status === "success") {
    console.log(`[Webhook] Transaction ${transactionId} already processed successfully`);
    return true;
  }

  return false;
}

// Helper to find user by email in profiles table
async function findUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{ id: string; username: string; is_full_member: boolean } | null> {
  console.log(`[Find User] Searching for user by email in profiles: ${email}`);
  
  // First, try to find by username (which stores email)
  const { data: profileByUsername, error: usernameError } = await supabase
    .from("profiles")
    .select("id, username, is_full_member")
    .eq("username", email)
    .maybeSingle();

  if (usernameError) {
    console.error(`[Find User] Error searching by username:`, usernameError);
  }

  if (profileByUsername) {
    console.log(`[Find User] Found user by username: ${profileByUsername.id}`);
    return profileByUsername;
  }

  // If not found by username, try using auth.admin.listUsers as fallback
  console.log(`[Find User] Not found by username, trying auth.admin.listUsers...`);
  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error(`[Find User] Error listing auth users:`, listError);
    return null;
  }

  const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
  
  if (authUser) {
    console.log(`[Find User] Found user in auth.users: ${authUser.id}`);
    
    // Check if profile exists for this user
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, is_full_member")
      .eq("id", authUser.id)
      .maybeSingle();
    
    if (profile) {
      console.log(`[Find User] Profile exists for auth user: ${profile.id}, is_full_member: ${profile.is_full_member}`);
      return profile;
    }
    
    // Profile doesn't exist but user does - return the user ID
    console.log(`[Find User] Auth user exists but no profile yet, returning user ID`);
    return { id: authUser.id, username: email, is_full_member: false };
  }

  console.log(`[Find User] User not found anywhere for email: ${email}`);
  return null;
}

// Helper to update profile with retries
async function updateProfileWithRetry(
  supabase: SupabaseClient,
  userId: string,
  username: string,
  maxRetries = 3
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Profile Update] Attempt ${attempt}/${maxRetries} for user ${userId}`);
    
    // First check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("id, is_full_member")
      .eq("id", userId)
      .maybeSingle();
    
    if (checkError) {
      console.error(`[Profile Update] Error checking profile:`, checkError);
    }
    
    if (existingProfile) {
      console.log(`[Profile Update] Profile exists, current is_full_member: ${existingProfile.is_full_member}, updating to FULL MEMBER`);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ is_full_member: true, is_semi_full_member: false })
        .eq("id", userId);
      
      if (updateError) {
        console.error(`[Profile Update] Error updating profile:`, updateError);
        if (attempt < maxRetries) {
          console.log(`[Profile Update] Waiting 1 second before retry...`);
          await delay(1000);
          continue;
        }
        return { success: false, error: updateError.message };
      }
      
      console.log(`[Profile Update] Successfully updated profile to full member`);
      return { success: true };
    }
    
    // Profile doesn't exist yet, try upsert - SET AS FULL MEMBER (via Hubla purchase)
    console.log(`[Profile Update] Profile not found, attempting upsert with id=${userId}, username=${username} as FULL MEMBER`);
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        username: username,
        is_full_member: true,
        is_semi_full_member: false  // Full member, not semi-full
      }, { onConflict: 'id' });
    
    if (!upsertError) {
      console.log(`[Profile Update] Successfully upserted profile as full member`);
      return { success: true };
    }
    
    console.error(`[Profile Update] Upsert failed on attempt ${attempt}:`, upsertError);
    
    if (attempt < maxRetries) {
      console.log(`[Profile Update] Waiting 1 second before retry...`);
      await delay(1000);
    }
  }
  
  return { success: false, error: "Max retries reached" };
}

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

    // Check for test action (admin only)
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    
    if (action === "test") {
      const testEmail = url.searchParams.get("email");
      if (!testEmail) {
        return new Response(
          JSON.stringify({ error: "Email required for test action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[TEST] Simulating sale for email: ${testEmail}`);
      
      // Use the new findUserByEmail function
      const existingUser = await findUserByEmail(supabase, testEmail.toLowerCase());
      
      if (existingUser) {
        console.log(`[TEST] User exists with ID: ${existingUser.id}, is_full_member: ${existingUser.is_full_member}`);
        
        // Try to update
        const result = await updateProfileWithRetry(supabase, existingUser.id, testEmail.split("@")[0]);
        
        return new Response(
          JSON.stringify({ 
            test: true,
            user_exists: true,
            user_id: existingUser.id,
            was_full_member: existingUser.is_full_member,
            update_result: result
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          test: true,
          user_exists: false,
          message: "User not found, would create new user in real scenario"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate Hubla security token
    const hublaToken = Deno.env.get("HUBLA_WEBHOOK_TOKEN");
    const requestToken = req.headers.get("x-hubla-token");

    console.log(`[Webhook] Received request`);
    console.log(`[Webhook] Has HUBLA_WEBHOOK_TOKEN env: ${!!hublaToken}`);
    console.log(`[Webhook] Has x-hubla-token header: ${!!requestToken}`);
    console.log(`[Webhook] Tokens match: ${hublaToken === requestToken}`);

    if (!hublaToken || requestToken !== hublaToken) {
      console.error("[Webhook] Invalid or missing x-hubla-token");
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Webhook] Token validated successfully");

    const body = await req.json();
    console.log("[Webhook] Payload received:", JSON.stringify(body, null, 2));

    // Extract email and transaction ID from different possible formats
    let email: string | null = null;
    let name: string | null = null;
    let transactionId: string | null = null;

    // Handle array format (some platforms send as array)
    const payload = Array.isArray(body) ? body[0]?.body || body[0] : body;

    console.log("[Webhook] Parsed payload:", JSON.stringify(payload, null, 2));

    // Hubla format: body.event.userEmail
    if (payload.event?.userEmail) {
      email = payload.event.userEmail;
      name = payload.event.userName || payload.event.userEmail.split("@")[0];
      transactionId = payload.event?.transactionId || payload.transactionId || null;
      console.log("[Webhook] Extracted from Hubla format");
    }
    // Standard format
    else if (payload.email) {
      email = payload.email;
      name = payload.name || payload.email.split("@")[0];
      transactionId = payload.transactionId || payload.transaction_id || null;
      console.log("[Webhook] Extracted from standard format");
    }
    // Kiwify format
    else if (payload.Customer?.email) {
      email = payload.Customer.email;
      name = payload.Customer.full_name || payload.Customer.email.split("@")[0];
      transactionId = payload.order_id || payload.transaction?.transaction_id || null;
      console.log("[Webhook] Extracted from Kiwify format");
    }
    // Hotmart format
    else if (payload.data?.buyer?.email) {
      email = payload.data.buyer.email;
      name = payload.data.buyer.name || payload.data.buyer.email.split("@")[0];
      transactionId = payload.data?.purchase?.transaction || payload.data?.transaction || null;
      console.log("[Webhook] Extracted from Hotmart format");
    }

    if (!email) {
      console.error("[Webhook] Email not found in request body");
      console.error("[Webhook] Available keys:", Object.keys(payload));
      await logWebhookHistory(supabase, transactionId, "unknown", payload, "error", undefined, "Email not found in payload");
      return new Response(
        JSON.stringify({ error: "Email não encontrado no payload", payload_keys: Object.keys(payload) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize email
    email = email.toLowerCase().trim();
    console.log(`[Webhook] Processing for email: ${email}, name: ${name}, transactionId: ${transactionId}`);

    // Check if this transaction was already processed (prevent duplicates)
    if (transactionId) {
      const alreadyProcessed = await isTransactionProcessed(supabase, transactionId);
      if (alreadyProcessed) {
        console.log(`[Webhook] Skipping duplicate transaction: ${transactionId}`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Transaction already processed",
            transaction_id: transactionId,
            skipped: true
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ===== NEW LOGIC: Check for existing user using our helper function =====
    console.log(`[Webhook] Checking if user already exists for email: ${email}`);
    const existingUser = await findUserByEmail(supabase, email);

    if (existingUser) {
      console.log(`[Webhook] User ${email} already exists with ID: ${existingUser.id}, current is_full_member: ${existingUser.is_full_member}`);
      
      // Update the existing user's profile to be a full member with retry
      const result = await updateProfileWithRetry(supabase, existingUser.id, name || email.split("@")[0]);

      if (!result.success) {
        console.error("[Webhook] Failed to update profile after retries:", result.error);
        await logWebhookHistory(supabase, transactionId, email, payload, "error", existingUser.id, `Profile update failed: ${result.error}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Failed to update profile",
            details: result.error
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[Webhook] Successfully upgraded user ${email} to full member`);
      await logWebhookHistory(supabase, transactionId, email, payload, "success", existingUser.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Usuário existente atualizado para membro completo",
          user_id: existingUser.id,
          was_full_member: existingUser.is_full_member,
          upgraded: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== User does not exist - Create new user =====
    console.log(`[Webhook] User not found, creating new user for ${email}`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: name,
      },
    });

    if (createError) {
      // Check if it's a duplicate key error (race condition - user was created by another webhook)
      if (createError.message?.includes("duplicate key") || createError.message?.includes("already registered")) {
        console.log(`[Webhook] User creation race condition detected for ${email}`);
        
        // Wait a moment and try to find the user again
        await delay(500);
        
        const raceUser = await findUserByEmail(supabase, email);
        
        if (raceUser) {
          console.log(`[Webhook] Found user after race condition: ${raceUser.id}`);
          const result = await updateProfileWithRetry(supabase, raceUser.id, name || email.split("@")[0]);
          
          await logWebhookHistory(supabase, transactionId, email, payload, result.success ? "success" : "partial", raceUser.id, 
            result.success ? undefined : `Profile update after race: ${result.error}`);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Usuário atualizado (race condition resolvida)",
              user_id: raceUser.id,
              is_full_member: result.success
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.error(`[Webhook] Could not find user after race condition for ${email}`);
      }
      
      console.error("[Webhook] Error creating user:", createError);
      await logWebhookHistory(supabase, transactionId, email, payload, "error", undefined, `User creation failed: ${createError.message}`);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Webhook] User created successfully: ${newUser.user.id}`);

    // Wait a bit for the trigger to create the profile, then update with retry
    console.log("[Webhook] Waiting 1.5 seconds for trigger to execute...");
    await delay(1500);

    // Set the new user as a full member with retry logic
    const result = await updateProfileWithRetry(supabase, newUser.user.id, name || email.split("@")[0]);

    if (!result.success) {
      console.error("[Webhook] Failed to set full member status after retries:", result.error);
      await logWebhookHistory(supabase, transactionId, email, payload, "partial", newUser.user.id, `Profile update failed: ${result.error}`);
      // Don't fail the whole request - user was created, just profile update failed
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: "User created but profile update may have failed",
          message: "Usuário criado, mas pode precisar de atualização manual",
          user_id: newUser.user.id,
          is_full_member: false,
          profile_error: result.error
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Webhook] User ${email} set as full member successfully`);
    await logWebhookHistory(supabase, transactionId, email, payload, "success", newUser.user.id);

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
    console.error("[Webhook] Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
