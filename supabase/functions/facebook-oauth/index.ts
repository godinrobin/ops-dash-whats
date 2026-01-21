import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID");
const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Redirect URI - same as the original working one (Facebook blocks URIs with fragments)
const CROSS_BROWSER_REDIRECT_URI = "https://zapdata.co/";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ============================================================
    // ACTION: exchange_code_with_token (NO AUTH REQUIRED)
    // Used when user completes OAuth in another browser
    // ============================================================
    if (action === "exchange_code_with_token") {
      const { code, token, redirect_uri } = body;

      if (!code || !token) {
        return new Response(JSON.stringify({ error: "code and token are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use service role to validate token (user is not authenticated in this browser)
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Find valid token
      const { data: tokenData, error: tokenError } = await supabaseAdmin
        .from("ads_oauth_tokens")
        .select("*")
        .eq("token", token)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (tokenError || !tokenData) {
        console.error("Invalid or expired token:", tokenError);
        return new Response(JSON.stringify({ error: "Token inválido ou expirado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark token as used immediately
      await supabaseAdmin
        .from("ads_oauth_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenData.id);

      const userId = tokenData.user_id;
      const finalRedirectUri = redirect_uri || CROSS_BROWSER_REDIRECT_URI;

      console.log("Cross-browser OAuth: exchanging code for user:", userId);

      // Exchange code for token
      const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(finalRedirectUri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;
      const tokenResponse = await fetch(tokenUrl);
      const fbTokenData = await tokenResponse.json();

      if (fbTokenData.error) {
        console.error("Facebook token error:", fbTokenData.error);
        return new Response(JSON.stringify({ error: fbTokenData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange for long-lived token
      const longLivedUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${fbTokenData.access_token}`;
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json();

      if (longLivedData.error) {
        console.error("Long-lived token error:", longLivedData.error);
        return new Response(JSON.stringify({ error: longLivedData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = longLivedData.access_token;
      const expiresIn = longLivedData.expires_in || 5184000;

      // Get user info from Facebook
      const userInfoUrl = `https://graph.facebook.com/v18.0/me?fields=id,name,email,picture&access_token=${accessToken}`;
      const userInfoResponse = await fetch(userInfoUrl);
      const userInfo = await userInfoResponse.json();

      console.log("Cross-browser OAuth: Facebook user:", userInfo.id, userInfo.name);

      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Save or update Facebook account using service role
      const { data: existingAccount } = await supabaseAdmin
        .from("ads_facebook_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("facebook_user_id", userInfo.id)
        .maybeSingle();

      if (existingAccount) {
        await supabaseAdmin
          .from("ads_facebook_accounts")
          .update({
            access_token: accessToken,
            token_expires_at: tokenExpiresAt,
            name: userInfo.name,
            email: userInfo.email,
            profile_pic_url: userInfo.picture?.data?.url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingAccount.id);
      } else {
        await supabaseAdmin.from("ads_facebook_accounts").insert({
          user_id: userId,
          facebook_user_id: userInfo.id,
          access_token: accessToken,
          token_expires_at: tokenExpiresAt,
          name: userInfo.name,
          email: userInfo.email,
          profile_pic_url: userInfo.picture?.data?.url,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          facebookUserId: userInfo.id,
          name: userInfo.name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // All other actions require authentication
    // ============================================================
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Facebook OAuth action:", action, "for user:", user.id);

    // ============================================================
    // ACTION: generate_oauth_link
    // Generates a link with pre-authorized token for cross-browser OAuth
    // ============================================================
    if (action === "generate_oauth_link") {
      // Generate unique token
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Save token to database
      const { error: insertError } = await supabaseClient
        .from("ads_oauth_tokens")
        .insert({
          user_id: user.id,
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error("Error saving OAuth token:", insertError);
        return new Response(JSON.stringify({ error: "Failed to generate link" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build OAuth URL with state containing the token
      const scopes = [
        "ads_management",
        "ads_read",
        "business_management",
        "pages_read_engagement",
        "pages_show_list"
      ].join(",");

      const state = encodeURIComponent(JSON.stringify({ token }));
      const redirectUri = encodeURIComponent(CROSS_BROWSER_REDIRECT_URI);

      const oauthLink = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${state}`;

      console.log("Generated cross-browser OAuth link for user:", user.id);

      return new Response(
        JSON.stringify({ 
          oauth_link: oauthLink, 
          expires_in: 300,
          expires_at: expiresAt.toISOString()
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate Facebook OAuth login URL
    if (action === "get_login_url") {
      const { redirect_uri } = body;
      
      if (!redirect_uri) {
        console.error("redirect_uri is required");
        return new Response(JSON.stringify({ error: "redirect_uri is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const scopes = [
        "ads_management",
        "ads_read",
        "business_management",
        "pages_read_engagement",
        "pages_show_list"
      ].join(",");

      const loginUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scopes}&response_type=code`;

      console.log("Generated login URL with redirect:", redirect_uri);

      return new Response(
        JSON.stringify({ login_url: loginUrl, redirect_uri: redirect_uri }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Exchange authorization code for access token
    if (action === "exchange_code") {
      const { code, redirect_uri } = body;
      
      if (!redirect_uri) {
        console.error("redirect_uri is required for exchange_code");
        return new Response(JSON.stringify({ error: "redirect_uri is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;

      console.log("Exchanging code for token...");
      const tokenResponse = await fetch(tokenUrl);
      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("Facebook token error:", tokenData.error);
        return new Response(JSON.stringify({ error: tokenData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Got short-lived token, exchanging for long-lived token...");

      // Exchange for long-lived token
      const longLivedUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`;

      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json();

      if (longLivedData.error) {
        console.error("Long-lived token error:", longLivedData.error);
        return new Response(JSON.stringify({ error: longLivedData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = longLivedData.access_token;
      const expiresIn = longLivedData.expires_in || 5184000; // 60 days default

      // Get user info from Facebook
      const userInfoUrl = `https://graph.facebook.com/v18.0/me?fields=id,name,email,picture&access_token=${accessToken}`;
      const userInfoResponse = await fetch(userInfoUrl);
      const userInfo = await userInfoResponse.json();

      console.log("Facebook user info:", userInfo.id, userInfo.name);

      // Calculate token expiration
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Save or update Facebook account
      const { data: existingAccount } = await supabaseClient
        .from("ads_facebook_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("facebook_user_id", userInfo.id)
        .maybeSingle();

      if (existingAccount) {
        await supabaseClient
          .from("ads_facebook_accounts")
          .update({
            access_token: accessToken,
            token_expires_at: tokenExpiresAt,
            name: userInfo.name,
            email: userInfo.email,
            profile_pic_url: userInfo.picture?.data?.url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingAccount.id);
      } else {
        await supabaseClient.from("ads_facebook_accounts").insert({
          user_id: user.id,
          facebook_user_id: userInfo.id,
          access_token: accessToken,
          token_expires_at: tokenExpiresAt,
          name: userInfo.name,
          email: userInfo.email,
          profile_pic_url: userInfo.picture?.data?.url,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          facebookUserId: userInfo.id,
          name: userInfo.name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get and sync ad accounts from Facebook
    if (action === "get_ad_accounts") {
      const { facebook_account_id } = body;

      // Get the Facebook account
      const { data: fbAccount, error: fbError } = await supabaseClient
        .from("ads_facebook_accounts")
        .select("*")
        .eq("id", facebook_account_id)
        .eq("user_id", user.id)
        .single();

      if (fbError || !fbAccount) {
        console.error("Facebook account not found:", fbError);
        return new Response(JSON.stringify({ error: "Facebook account not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch ad accounts from Facebook
      const adAccountsUrl = `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name&access_token=${fbAccount.access_token}`;
      console.log("Fetching ad accounts from Facebook...");
      const adAccountsResponse = await fetch(adAccountsUrl);
      const adAccountsData = await adAccountsResponse.json();

      if (adAccountsData.error) {
        console.error("Ad accounts error:", adAccountsData.error);
        return new Response(JSON.stringify({ error: adAccountsData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adAccounts = adAccountsData.data || [];
      console.log("Found", adAccounts.length, "ad accounts");

      // Sync ad accounts to database
      for (const account of adAccounts) {
        const adAccountId = account.id.replace("act_", "");

        const { data: existing } = await supabaseClient
          .from("ads_ad_accounts")
          .select("id")
          .eq("user_id", user.id)
          .eq("ad_account_id", adAccountId)
          .maybeSingle();

        if (existing) {
          await supabaseClient
            .from("ads_ad_accounts")
            .update({
              name: account.name,
              account_status: account.account_status,
              currency: account.currency,
              timezone: account.timezone_name,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabaseClient.from("ads_ad_accounts").insert({
            user_id: user.id,
            facebook_account_id: facebook_account_id,
            ad_account_id: adAccountId,
            name: account.name,
            account_status: account.account_status,
            currency: account.currency,
            timezone: account.timezone_name,
            is_selected: false,
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, count: adAccounts.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sync pixels for a specific ad account
    if (action === "sync_pixels") {
      const { ad_account_id } = body;

      // Get the ad account with Facebook account info
      const { data: adAccount, error: adAccountError } = await supabaseClient
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("id", ad_account_id)
        .eq("user_id", user.id)
        .single();

      if (adAccountError || !adAccount) {
        console.error("Ad account not found:", adAccountError);
        return new Response(JSON.stringify({ error: "Ad account not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = adAccount.ads_facebook_accounts?.access_token;
      if (!accessToken) {
        console.error("No access token found for Facebook account");
        return new Response(JSON.stringify({ error: "No access token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch pixels from Facebook
      const pixelsUrl = `https://graph.facebook.com/v21.0/act_${adAccount.ad_account_id}/adspixels?fields=id,name&access_token=${accessToken}`;
      console.log("Fetching pixels for ad account:", adAccount.ad_account_id);
      const pixelsResponse = await fetch(pixelsUrl);
      const pixelsData = await pixelsResponse.json();

      if (pixelsData.error) {
        console.error("Pixels error:", pixelsData.error);
        return new Response(JSON.stringify({ error: pixelsData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pixelsList = pixelsData.data || [];
      console.log("Found", pixelsList.length, "pixels for ad account", adAccount.ad_account_id);

      // Sync pixels to database
      for (const pixel of pixelsList) {
        const { data: existing } = await supabaseClient
          .from("ads_pixels")
          .select("id")
          .eq("ad_account_id", ad_account_id)
          .eq("pixel_id", pixel.id)
          .maybeSingle();

        if (existing) {
          await supabaseClient
            .from("ads_pixels")
            .update({
              name: pixel.name,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabaseClient.from("ads_pixels").insert({
            user_id: user.id,
            ad_account_id: ad_account_id,
            pixel_id: pixel.id,
            name: pixel.name,
            is_selected: pixelsList.length === 1, // Auto-select if only one pixel
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, count: pixelsList.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Facebook OAuth error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
