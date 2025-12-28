import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FETCH_TIMEOUT = 25000; // 25 seconds timeout

interface FacebookInsight {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

interface FacebookCampaign {
  id: string;
  name: string;
  status: string;
  insights?: { data: FacebookInsight[] };
}

interface FacebookAdset {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  insights?: { data: FacebookInsight[] };
}

interface FacebookAd {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  adset_id: string;
  insights?: { data: FacebookInsight[] };
  creative?: { thumbnail_url?: string };
}

// Fetch with timeout to prevent hanging
async function fetchWithTimeout(url: string, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout: Request took longer than ${timeout / 1000}s`);
    }
    throw error;
  }
}

function extractMetrics(insightsData: FacebookInsight[] | undefined) {
  if (!insightsData || insightsData.length === 0) {
    return {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      cpm: 0,
      cpc: 0,
      ctr: 0,
      results: 0,
      cost_per_result: 0,
      cost_per_message: 0,
      messaging_conversations_started: 0,
      meta_conversions: 0,
      conversion_value: 0,
    };
  }

  const insight = insightsData[0];
  const actions = insight.actions || [];
  const actionValues = insight.action_values || [];

  const getActionValue = (actionType: string) => {
    const action = actions.find((a) => a.action_type === actionType);
    return action ? parseFloat(action.value) : 0;
  };

  const getActionMoneyValue = (actionType: string) => {
    const action = actionValues.find((a) => a.action_type === actionType);
    return action ? parseFloat(action.value) : 0;
  };

  const spend = parseFloat(insight.spend || "0");
  const conversations = getActionValue("onsite_conversion.messaging_conversation_started_7d");
  const conversions = getActionValue("omni_purchase") || getActionValue("purchase");
  const conversionValue = getActionMoneyValue("omni_purchase") || getActionMoneyValue("purchase");

  return {
    spend,
    impressions: parseInt(insight.impressions || "0"),
    reach: parseInt(insight.reach || "0"),
    clicks: parseInt(insight.clicks || "0"),
    cpm: parseFloat(insight.cpm || "0"),
    cpc: parseFloat(insight.cpc || "0"),
    ctr: parseFloat(insight.ctr || "0"),
    results: conversions || conversations,
    cost_per_result: conversions > 0 ? spend / conversions : 0,
    cost_per_message: conversations > 0 ? spend / conversations : 0,
    messaging_conversations_started: conversations,
    meta_conversions: conversions,
    conversion_value: conversionValue,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user from the auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin role
    const { data: adminRole } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, targetUserId, datePreset } = await req.json();
    console.log(`Admin Facebook Insights - Action: ${action}, Target: ${targetUserId}, Preset: ${datePreset}`);

    if (action === "fetch_user_insights") {
      if (!targetUserId || !datePreset) {
        return new Response(
          JSON.stringify({ error: "Missing targetUserId or datePreset" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get target user's Facebook accounts
      const { data: fbAccounts, error: fbError } = await supabaseClient
        .from("ads_facebook_accounts")
        .select("*")
        .eq("user_id", targetUserId);

      if (fbError) throw fbError;

      if (!fbAccounts || fbAccounts.length === 0) {
        return new Response(
          JSON.stringify({ 
            campaigns: [], 
            adsets: [], 
            ads: [],
            message: "User has no connected Facebook accounts" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get ad accounts
      const { data: adAccounts, error: adError } = await supabaseClient
        .from("ads_ad_accounts")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("is_selected", true);

      if (adError) throw adError;

      if (!adAccounts || adAccounts.length === 0) {
        return new Response(
          JSON.stringify({ 
            campaigns: [], 
            adsets: [], 
            ads: [],
            message: "User has no selected ad accounts" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Map date preset to Facebook date_preset format
      const fbDatePreset = datePreset === "today" ? "today" 
        : datePreset === "yesterday" ? "yesterday" 
        : datePreset === "last_7d" ? "last_7d" 
        : "last_7d";

      const allCampaigns: any[] = [];
      const allAdsets: any[] = [];
      const allAds: any[] = [];

      for (const adAccount of adAccounts) {
        // Find the facebook account for this ad account
        const fbAccount = fbAccounts.find(fb => fb.id === adAccount.facebook_account_id);
        if (!fbAccount) {
          console.log(`No Facebook account found for ad account ${adAccount.ad_account_id}`);
          continue;
        }

        const accessToken = fbAccount.access_token;
        const adAccountId = adAccount.ad_account_id.startsWith("act_") 
          ? adAccount.ad_account_id 
          : `act_${adAccount.ad_account_id}`;

        // Fetch campaigns from Facebook API
        const campaignsFields = "id,name,status";
        const insightsFields = "spend,impressions,reach,clicks,cpm,cpc,ctr,actions,action_values";
        
        try {
          const campaignsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=${campaignsFields},insights.date_preset(${fbDatePreset}){${insightsFields}}&access_token=${accessToken}&limit=500`;
          const adsetsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/adsets?fields=id,name,status,campaign_id,insights.date_preset(${fbDatePreset}){${insightsFields}}&access_token=${accessToken}&limit=500`;
          const adsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/ads?fields=id,name,status,campaign_id,adset_id,creative{thumbnail_url},insights.date_preset(${fbDatePreset}){${insightsFields}}&access_token=${accessToken}&limit=500`;
          
          console.log(`Fetching campaigns, adsets and ads in parallel for account ${adAccountId} with date_preset ${fbDatePreset}`);
          
          // Parallel fetch for campaigns, adsets and ads
          const [campaignsResponse, adsetsResponse, adsResponse] = await Promise.all([
            fetchWithTimeout(campaignsUrl),
            fetchWithTimeout(adsetsUrl),
            fetchWithTimeout(adsUrl),
          ]);

          const [campaignsData, adsetsData, adsData] = await Promise.all([
            campaignsResponse.json(),
            adsetsResponse.json(),
            adsResponse.json(),
          ]);

          // Process campaigns
          if (!campaignsData.error) {
            const campaigns: FacebookCampaign[] = campaignsData.data || [];
            for (const campaign of campaigns) {
              if (campaign.status === "DELETED") continue;
              const metrics = extractMetrics(campaign.insights?.data);
              allCampaigns.push({
                campaign_id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                ad_account_id: adAccount.id,
                ...metrics,
              });
            }
          } else {
            console.error(`Facebook API error for campaigns:`, campaignsData.error);
          }

          // Process adsets
          if (!adsetsData.error) {
            const adsets: FacebookAdset[] = adsetsData.data || [];
            for (const adset of adsets) {
              if (adset.status === "DELETED") continue;
              const metrics = extractMetrics(adset.insights?.data);
              allAdsets.push({
                adset_id: adset.id,
                campaign_id: adset.campaign_id,
                name: adset.name,
                status: adset.status,
                ad_account_id: adAccount.id,
                ...metrics,
              });
            }
          } else {
            console.error(`Facebook API error for adsets:`, adsetsData.error);
          }

          // Process ads
          if (!adsData.error) {
            const ads: FacebookAd[] = adsData.data || [];
            for (const ad of ads) {
              if (ad.status === "DELETED") continue;
              const metrics = extractMetrics(ad.insights?.data);
              allAds.push({
                ad_id: ad.id,
                campaign_id: ad.campaign_id,
                adset_id: ad.adset_id,
                name: ad.name,
                status: ad.status,
                thumbnail_url: ad.creative?.thumbnail_url || null,
                ad_account_id: adAccount.id,
                ...metrics,
              });
            }
          } else {
            console.error(`Facebook API error for ads:`, adsData.error);
          }

        } catch (apiError) {
          console.error(`Error fetching from Facebook API for account ${adAccountId}:`, apiError);
          continue;
        }
      }

      console.log(`Admin insights fetched: ${allCampaigns.length} campaigns, ${allAdsets.length} adsets, ${allAds.length} ads`);

      return new Response(
        JSON.stringify({
          campaigns: allCampaigns,
          adsets: allAdsets,
          ads: allAds,
          datePreset: fbDatePreset,
          fetchedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in admin-facebook-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
