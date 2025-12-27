import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID");
const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, code, redirectUri } = await req.json();
    console.log("Facebook OAuth action:", action, "for user:", user.id);

    if (action === "exchange_code") {
      // Exchange authorization code for access token
      const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;

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
        .single();

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

    if (action === "get_ad_accounts") {
      const { facebookAccountId } = await req.json();

      // Get the Facebook account
      const { data: fbAccount, error: fbError } = await supabaseClient
        .from("ads_facebook_accounts")
        .select("*")
        .eq("id", facebookAccountId)
        .eq("user_id", user.id)
        .single();

      if (fbError || !fbAccount) {
        return new Response(JSON.stringify({ error: "Facebook account not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch ad accounts from Facebook
      const adAccountsUrl = `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name&access_token=${fbAccount.access_token}`;
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
          .single();

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
            facebook_account_id: facebookAccountId,
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
