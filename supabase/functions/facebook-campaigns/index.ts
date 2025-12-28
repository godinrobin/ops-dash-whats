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

    const body = await req.json();
    const { action } = body;
    console.log("Facebook campaigns action:", action, "for user:", user.id);

    // Helper function to extract metrics from insights
    const extractMetrics = (insights: any) => {
      const insightsData = insights?.data?.[0] || {};
      const actions = insightsData.actions || [];
      const costPerAction = insightsData.cost_per_action_type || [];
      const actionValues = insightsData.action_values || [];

      // Extract messaging conversations
      const conversationActionTypePrimary = "onsite_conversion.messaging_conversation_started_7d";
      const conversationActionTypeFallback = "messaging_conversation_started_7d";

      const conversationAction =
        actions.find((a: any) => a.action_type === conversationActionTypePrimary) ||
        actions.find((a: any) => a.action_type === conversationActionTypeFallback);

      const messagingConversations = conversationAction ? parseInt(conversationAction.value || 0) : 0;
      const chosenConversationActionType = conversationAction?.action_type ?? "n/a";

      const costPerConversationAction = costPerAction.find(
        (a: any) => a.action_type === chosenConversationActionType
      );

      const costPerConversationFromApi = costPerConversationAction
        ? parseFloat(costPerConversationAction.value || 0)
        : 0;

      const costPerMessageValue =
        costPerConversationFromApi ||
        (messagingConversations > 0
          ? parseFloat(insightsData.spend || 0) / messagingConversations
          : 0);

      // Extract purchases
      const purchaseActionTypesPriority = [
        "omni_purchase",
        "purchase",
        "offsite_conversion.fb_pixel_purchase",
      ];

      const purchaseAction = purchaseActionTypesPriority
        .map((t) =>
          actions.find(
            (a: any) => a.action_type === t || String(a.action_type || "").includes(t)
          )
        )
        .find(Boolean) as any;

      const purchases = purchaseAction ? parseInt(purchaseAction.value || 0) : 0;

      const purchaseValueAction = purchaseActionTypesPriority
        .map((t) =>
          actionValues.find(
            (a: any) => a.action_type === t || String(a.action_type || "").includes(t)
          )
        )
        .find(Boolean) as any;

      const conversionValue = purchaseValueAction ? parseFloat(purchaseValueAction.value || 0) : 0;

      return {
        spend: parseFloat(insightsData.spend || 0),
        impressions: parseInt(insightsData.impressions || 0),
        clicks: parseInt(insightsData.clicks || 0),
        reach: parseInt(insightsData.reach || 0),
        cpm: parseFloat(insightsData.cpm || 0),
        ctr: parseFloat(insightsData.ctr || 0),
        cpc: parseFloat(insightsData.cost_per_inline_link_click || 0),
        cost_per_message: costPerMessageValue,
        messaging_conversations_started: messagingConversations,
        meta_conversions: purchases,
        conversion_value: conversionValue,
      };
    };

    // Sync campaigns from all selected ad accounts
    if (action === "sync_campaigns") {
      const { adAccountId, datePreset = "last_7d" } = body;

      // Get selected ad accounts (or specific one if provided)
      let query = supabaseClient
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("user_id", user.id);

      if (adAccountId) {
        query = query.eq("id", adAccountId);
      } else {
        query = query.eq("is_selected", true);
      }

      const { data: adAccounts, error: adAccountsError } = await query;

      if (adAccountsError || !adAccounts?.length) {
        console.log("No ad accounts found to sync");
        return new Response(
          JSON.stringify({ success: true, message: "No ad accounts to sync", count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let totalCampaigns = 0;

      for (const adAccount of adAccounts) {
        const accessToken = adAccount.ads_facebook_accounts?.access_token;
        if (!accessToken) {
          console.log(`No access token for ad account ${adAccount.id}`);
          continue;
        }

        const datePresetInput = datePreset || 'last_7d';
        const datePresetMap: Record<string, string> = {
          'today': 'today',
          'yesterday': 'yesterday',
          'last_7d': 'last_7d',
          'last_30d': 'last_30d',
          'this_month': 'this_month'
        };
        const mappedDatePreset = datePresetMap[datePresetInput] || 'last_7d';
        
        console.log('Using date_preset:', mappedDatePreset);

        const insightsFields = [
          'spend', 'impressions', 'clicks', 'reach', 'cpm', 'ctr',
          'inline_link_click_ctr', 'cost_per_inline_link_click',
          'actions', 'cost_per_action_type', 'action_values'
        ].join(',');

        // Fetch campaigns with insights
        const campaignsUrl = `https://graph.facebook.com/v18.0/act_${adAccount.ad_account_id}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,insights.date_preset(${mappedDatePreset}){${insightsFields}}&access_token=${accessToken}`;
        
        console.log(`Fetching campaigns for account ${adAccount.ad_account_id}...`);
        const campaignsResponse = await fetch(campaignsUrl);
        const campaignsData = await campaignsResponse.json();

        if (campaignsData.error) {
          console.error("Campaigns error:", campaignsData.error);
          continue;
        }

        const campaigns = campaignsData.data || [];
        console.log(`Found ${campaigns.length} campaigns`);
        totalCampaigns += campaigns.length;

        // Get synced campaign IDs from Facebook
        const syncedCampaignIds = campaigns.map((c: any) => c.id);

        for (const campaign of campaigns) {
          const metrics = extractMetrics(campaign.insights);

          const campaignData = {
            campaign_id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            objective: campaign.objective,
            daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
            lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
            ...metrics,
            cost_per_result: 0,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { data: existing } = await supabaseClient
            .from("ads_campaigns")
            .select("id")
            .eq("user_id", user.id)
            .eq("campaign_id", campaign.id)
            .maybeSingle();

          if (existing) {
            await supabaseClient
              .from("ads_campaigns")
              .update(campaignData)
              .eq("id", existing.id);
          } else {
            await supabaseClient.from("ads_campaigns").insert({
              user_id: user.id,
              ad_account_id: adAccount.id,
              ...campaignData,
            });
          }
        }

        // Delete campaigns that no longer exist in Facebook
        const { data: existingCampaigns } = await supabaseClient
          .from("ads_campaigns")
          .select("id, campaign_id")
          .eq("user_id", user.id)
          .eq("ad_account_id", adAccount.id);

        if (existingCampaigns) {
          const campaignsToDelete = existingCampaigns.filter(
            (existing) => !syncedCampaignIds.includes(existing.campaign_id)
          );

          if (campaignsToDelete.length > 0) {
            const idsToDelete = campaignsToDelete.map((c) => c.id);
            console.log(`Deleting ${campaignsToDelete.length} campaigns that no longer exist in Facebook:`, campaignsToDelete.map(c => c.campaign_id));
            
            await supabaseClient
              .from("ads_campaigns")
              .delete()
              .in("id", idsToDelete);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, count: totalCampaigns }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sync ad sets
    if (action === "sync_adsets") {
      const { datePreset = "last_7d" } = body;

      const { data: adAccounts } = await supabaseClient
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("user_id", user.id)
        .eq("is_selected", true);

      if (!adAccounts?.length) {
        return new Response(
          JSON.stringify({ success: true, message: "No ad accounts to sync", count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let totalAdsets = 0;

      for (const adAccount of adAccounts) {
        const accessToken = adAccount.ads_facebook_accounts?.access_token;
        if (!accessToken) continue;

        const datePresetMap: Record<string, string> = {
          'today': 'today',
          'yesterday': 'yesterday',
          'last_7d': 'last_7d',
          'last_30d': 'last_30d',
          'this_month': 'this_month'
        };
        const mappedDatePreset = datePresetMap[datePreset] || 'last_7d';

        const insightsFields = [
          'spend', 'impressions', 'clicks', 'reach', 'cpm', 'ctr',
          'inline_link_click_ctr', 'cost_per_inline_link_click',
          'actions', 'cost_per_action_type', 'action_values'
        ].join(',');

        const adsetsUrl = `https://graph.facebook.com/v18.0/act_${adAccount.ad_account_id}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget,insights.date_preset(${mappedDatePreset}){${insightsFields}}&limit=500&access_token=${accessToken}`;
        
        console.log(`Fetching adsets for account ${adAccount.ad_account_id}...`);
        const adsetsResponse = await fetch(adsetsUrl);
        const adsetsData = await adsetsResponse.json();

        if (adsetsData.error) {
          console.error("Adsets error:", adsetsData.error);
          continue;
        }

        const adsets = adsetsData.data || [];
        console.log(`Found ${adsets.length} adsets`);
        totalAdsets += adsets.length;

        // Get synced adset IDs from Facebook
        const syncedAdsetIds = adsets.map((a: any) => a.id);

        for (const adset of adsets) {
          const metrics = extractMetrics(adset.insights);

          const adsetData = {
            adset_id: adset.id,
            campaign_id: adset.campaign_id,
            name: adset.name,
            status: adset.status,
            daily_budget: adset.daily_budget ? parseFloat(adset.daily_budget) / 100 : null,
            lifetime_budget: adset.lifetime_budget ? parseFloat(adset.lifetime_budget) / 100 : null,
            ...metrics,
            cost_per_result: 0,
            results: 0,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { data: existing } = await supabaseClient
            .from("ads_adsets")
            .select("id")
            .eq("user_id", user.id)
            .eq("adset_id", adset.id)
            .maybeSingle();

          if (existing) {
            await supabaseClient
              .from("ads_adsets")
              .update(adsetData)
              .eq("id", existing.id);
          } else {
            await supabaseClient.from("ads_adsets").insert({
              user_id: user.id,
              ad_account_id: adAccount.id,
              ...adsetData,
            });
          }
        }

        // Delete adsets that no longer exist in Facebook
        const { data: existingAdsets } = await supabaseClient
          .from("ads_adsets")
          .select("id, adset_id")
          .eq("user_id", user.id)
          .eq("ad_account_id", adAccount.id);

        if (existingAdsets) {
          const adsetsToDelete = existingAdsets.filter(
            (existing) => !syncedAdsetIds.includes(existing.adset_id)
          );

          if (adsetsToDelete.length > 0) {
            const idsToDelete = adsetsToDelete.map((a) => a.id);
            console.log(`Deleting ${adsetsToDelete.length} adsets that no longer exist in Facebook:`, adsetsToDelete.map(a => a.adset_id));
            
            await supabaseClient
              .from("ads_adsets")
              .delete()
              .in("id", idsToDelete);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, count: totalAdsets }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sync ads
    if (action === "sync_ads") {
      const { datePreset = "last_7d" } = body;

      const { data: adAccounts } = await supabaseClient
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("user_id", user.id)
        .eq("is_selected", true);

      if (!adAccounts?.length) {
        return new Response(
          JSON.stringify({ success: true, message: "No ad accounts to sync", count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let totalAds = 0;

      for (const adAccount of adAccounts) {
        const accessToken = adAccount.ads_facebook_accounts?.access_token;
        if (!accessToken) continue;

        const datePresetMap: Record<string, string> = {
          'today': 'today',
          'yesterday': 'yesterday',
          'last_7d': 'last_7d',
          'last_30d': 'last_30d',
          'this_month': 'this_month'
        };
        const mappedDatePreset = datePresetMap[datePreset] || 'last_7d';

        const insightsFields = [
          'spend', 'impressions', 'clicks', 'reach', 'cpm', 'ctr',
          'inline_link_click_ctr', 'cost_per_inline_link_click',
          'actions', 'cost_per_action_type', 'action_values'
        ].join(',');

        const adsUrl = `https://graph.facebook.com/v18.0/act_${adAccount.ad_account_id}/ads?fields=id,name,status,adset_id,campaign_id,creative{thumbnail_url},insights.date_preset(${mappedDatePreset}){${insightsFields}}&limit=500&access_token=${accessToken}`;
        
        console.log(`Fetching ads for account ${adAccount.ad_account_id}...`);
        const adsResponse = await fetch(adsUrl);
        const adsData = await adsResponse.json();

        if (adsData.error) {
          console.error("Ads error:", adsData.error);
          continue;
        }

        const ads = adsData.data || [];
        console.log(`Found ${ads.length} ads`);
        totalAds += ads.length;

        // Get synced ad IDs from Facebook
        const syncedAdIds = ads.map((a: any) => a.id);

        for (const ad of ads) {
          const metrics = extractMetrics(ad.insights);

          const adData = {
            ad_id: ad.id,
            adset_id: ad.adset_id,
            campaign_id: ad.campaign_id,
            name: ad.name,
            status: ad.status,
            creative_id: ad.creative?.id || null,
            thumbnail_url: ad.creative?.thumbnail_url || null,
            ...metrics,
            cost_per_result: 0,
            results: 0,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { data: existing } = await supabaseClient
            .from("ads_ads")
            .select("id")
            .eq("user_id", user.id)
            .eq("ad_id", ad.id)
            .maybeSingle();

          if (existing) {
            await supabaseClient
              .from("ads_ads")
              .update(adData)
              .eq("id", existing.id);
          } else {
            await supabaseClient.from("ads_ads").insert({
              user_id: user.id,
              ad_account_id: adAccount.id,
              ...adData,
            });
          }
        }

        // Delete ads that no longer exist in Facebook
        const { data: existingAds } = await supabaseClient
          .from("ads_ads")
          .select("id, ad_id")
          .eq("user_id", user.id)
          .eq("ad_account_id", adAccount.id);

        if (existingAds) {
          const adsToDelete = existingAds.filter(
            (existing) => !syncedAdIds.includes(existing.ad_id)
          );

          if (adsToDelete.length > 0) {
            const idsToDelete = adsToDelete.map((a) => a.id);
            console.log(`Deleting ${adsToDelete.length} ads that no longer exist in Facebook:`, adsToDelete.map(a => a.ad_id));
            
            await supabaseClient
              .from("ads_ads")
              .delete()
              .in("id", idsToDelete);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, count: totalAds }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update campaign status (pause/activate)
    if (action === "update_campaign_status") {
      const { campaignId, adAccountId, status } = body;

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

      const updateUrl = `https://graph.facebook.com/v18.0/${campaignId}`;
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

      await supabaseClient
        .from("ads_campaigns")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("campaign_id", campaignId)
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update adset status
    if (action === "update_adset_status") {
      const { adsetId, adAccountId, status } = body;

      const { data: adAccount } = await supabaseClient
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("id", adAccountId)
        .eq("user_id", user.id)
        .single();

      if (!adAccount?.ads_facebook_accounts?.access_token) {
        return new Response(JSON.stringify({ error: "No access token found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateUrl = `https://graph.facebook.com/v18.0/${adsetId}`;
      const updateResponse = await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          access_token: adAccount.ads_facebook_accounts.access_token,
        }),
      });

      const updateData = await updateResponse.json();

      if (updateData.error) {
        return new Response(JSON.stringify({ error: updateData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseClient
        .from("ads_adsets")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("adset_id", adsetId)
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update ad status
    if (action === "update_ad_status") {
      const { adId, adAccountId, status } = body;

      const { data: adAccount } = await supabaseClient
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("id", adAccountId)
        .eq("user_id", user.id)
        .single();

      if (!adAccount?.ads_facebook_accounts?.access_token) {
        return new Response(JSON.stringify({ error: "No access token found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateUrl = `https://graph.facebook.com/v18.0/${adId}`;
      const updateResponse = await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          access_token: adAccount.ads_facebook_accounts.access_token,
        }),
      });

      const updateData = await updateResponse.json();

      if (updateData.error) {
        return new Response(JSON.stringify({ error: updateData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseClient
        .from("ads_ads")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("ad_id", adId)
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update campaign budget
    if (action === "update_campaign_budget") {
      const { campaignId, adAccountId, daily_budget } = body;

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

      const updateUrl = `https://graph.facebook.com/v18.0/${campaignId}`;
      const updateResponse = await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daily_budget: Math.round(daily_budget),
          access_token: accessToken,
        }),
      });

      const updateData = await updateResponse.json();

      if (updateData.error) {
        console.error("Update budget error:", updateData.error);
        return new Response(JSON.stringify({ error: updateData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseClient
        .from("ads_campaigns")
        .update({ 
          daily_budget: daily_budget / 100, 
          updated_at: new Date().toISOString() 
        })
        .eq("campaign_id", campaignId)
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update adset budget
    if (action === "update_adset_budget") {
      const { adsetId, adAccountId, daily_budget } = body;

      const { data: adAccount } = await supabaseClient
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("id", adAccountId)
        .eq("user_id", user.id)
        .single();

      if (!adAccount?.ads_facebook_accounts?.access_token) {
        return new Response(JSON.stringify({ error: "No access token found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateUrl = `https://graph.facebook.com/v18.0/${adsetId}`;
      const updateResponse = await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daily_budget: Math.round(daily_budget),
          access_token: adAccount.ads_facebook_accounts.access_token,
        }),
      });

      const updateData = await updateResponse.json();

      if (updateData.error) {
        return new Response(JSON.stringify({ error: updateData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseClient
        .from("ads_adsets")
        .update({ 
          daily_budget: daily_budget / 100, 
          updated_at: new Date().toISOString() 
        })
        .eq("adset_id", adsetId)
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create campaign in multiple ad accounts
    if (action === "create_campaign") {
      const { name, objective, daily_budget, ad_account_ids } = body;

      if (!name || !daily_budget || !ad_account_ids?.length) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];

      for (const accountId of ad_account_ids) {
        const { data: adAccount, error: adAccountError } = await supabaseClient
          .from("ads_ad_accounts")
          .select("*, ads_facebook_accounts(*)")
          .eq("id", accountId)
          .eq("user_id", user.id)
          .single();

        if (adAccountError || !adAccount) {
          results.push({ accountId, success: false, error: "Ad account not found" });
          continue;
        }

        const accessToken = adAccount.ads_facebook_accounts?.access_token;
        if (!accessToken) {
          results.push({ accountId, success: false, error: "No access token" });
          continue;
        }

        const createUrl = `https://graph.facebook.com/v18.0/act_${adAccount.ad_account_id}/campaigns`;
        const createResponse = await fetch(createUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            objective: objective || "OUTCOME_ENGAGEMENT",
            status: "PAUSED",
            special_ad_categories: [],
            daily_budget: Math.round(daily_budget),
            access_token: accessToken,
          }),
        });

        const createData = await createResponse.json();

        if (createData.error) {
          console.error(`Create campaign error for account ${accountId}:`, createData.error);
          results.push({ accountId, success: false, error: createData.error.message });
          continue;
        }

        await supabaseClient.from("ads_campaigns").insert({
          user_id: user.id,
          ad_account_id: accountId,
          campaign_id: createData.id,
          name,
          status: "PAUSED",
          objective: objective || "OUTCOME_ENGAGEMENT",
          daily_budget: daily_budget / 100,
        });

        results.push({ accountId, success: true, campaignId: createData.id });
      }

      return new Response(
        JSON.stringify({ success: true, results }),
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
