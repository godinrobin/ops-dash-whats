import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, adAccountId, datePreset } = await req.json();
    console.log("Facebook campaigns action:", action, "for user:", user.id);

    if (action === "sync_campaigns") {
      // Get the ad account with Facebook account info
      const { data: adAccount, error: adAccountError } = await supabaseClient
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("id", adAccountId)
        .eq("user_id", user.id)
        .single();

      if (adAccountError || !adAccount) {
        return new Response(JSON.stringify({ error: "Ad account not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = adAccount.ads_facebook_accounts?.access_token;
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "No access token found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch campaigns with insights
      const campaignsUrl = `https://graph.facebook.com/v18.0/act_${adAccount.ad_account_id}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,insights.date_preset(${datePreset || "last_7d"}){spend,impressions,clicks,conversions,cpm,ctr,cost_per_conversion}&access_token=${accessToken}`;
      
      console.log("Fetching campaigns from Facebook...");
      const campaignsResponse = await fetch(campaignsUrl);
      const campaignsData = await campaignsResponse.json();

      if (campaignsData.error) {
        console.error("Campaigns error:", campaignsData.error);
        return new Response(JSON.stringify({ error: campaignsData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const campaigns = campaignsData.data || [];
      console.log("Found", campaigns.length, "campaigns");

      // Sync campaigns to database
      for (const campaign of campaigns) {
        const insights = campaign.insights?.data?.[0] || {};

        const campaignData = {
          campaign_id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
          lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
          spend: parseFloat(insights.spend || 0),
          impressions: parseInt(insights.impressions || 0),
          clicks: parseInt(insights.clicks || 0),
          conversions: parseInt(insights.conversions || 0),
          cpm: parseFloat(insights.cpm || 0),
          ctr: parseFloat(insights.ctr || 0),
          cost_per_result: parseFloat(insights.cost_per_conversion || 0),
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabaseClient
          .from("ads_campaigns")
          .select("id")
          .eq("user_id", user.id)
          .eq("campaign_id", campaign.id)
          .single();

        if (existing) {
          await supabaseClient
            .from("ads_campaigns")
            .update(campaignData)
            .eq("id", existing.id);
        } else {
          await supabaseClient.from("ads_campaigns").insert({
            user_id: user.id,
            ad_account_id: adAccountId,
            ...campaignData,
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, count: campaigns.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update_campaign_status") {
      const { campaignId, status } = await req.json();

      // Get the campaign with ad account and facebook account
      const { data: campaign, error: campaignError } = await supabaseClient
        .from("ads_campaigns")
        .select("*, ads_ad_accounts(*, ads_facebook_accounts(*))")
        .eq("id", campaignId)
        .eq("user_id", user.id)
        .single();

      if (campaignError || !campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = campaign.ads_ad_accounts?.ads_facebook_accounts?.access_token;
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "No access token found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update campaign status on Facebook
      const updateUrl = `https://graph.facebook.com/v18.0/${campaign.campaign_id}`;
      const updateResponse = await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          access_token: accessToken,
        }),
      });

      const updateData = await updateResponse.json();

      if (updateData.error) {
        console.error("Update campaign error:", updateData.error);
        return new Response(JSON.stringify({ error: updateData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update local database
      await supabaseClient
        .from("ads_campaigns")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", campaignId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Facebook campaigns error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
