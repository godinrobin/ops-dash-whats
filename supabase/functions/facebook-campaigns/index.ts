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

        // Map date preset from frontend to Facebook API format
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

        // Build insights fields - valid fields only (no messaging_first_reply or cost_per_messaging_reply)
        const insightsFields = [
          'spend', 'impressions', 'clicks', 'reach', 'cpm', 'ctr',
          'inline_link_click_ctr', 'cost_per_inline_link_click',
          'actions', 'cost_per_action_type', 'action_values'
        ].join(',');

        // Fetch campaigns with insights
        const campaignsUrl = `https://graph.facebook.com/v18.0/act_${adAccount.ad_account_id}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,insights.date_preset(${mappedDatePreset}){${insightsFields}}&access_token=${accessToken}`;
        
        console.log(`Fetching campaigns for account ${adAccount.ad_account_id} with date_preset ${mappedDatePreset}...`);
        const campaignsResponse = await fetch(campaignsUrl);
        const campaignsData = await campaignsResponse.json();

        if (campaignsData.error) {
          console.error("Campaigns error:", campaignsData.error);
          continue;
        }

        const campaigns = campaignsData.data || [];
        console.log(`Found ${campaigns.length} campaigns for account ${adAccount.ad_account_id}`);
        totalCampaigns += campaigns.length;

        // Sync campaigns to database
        for (const campaign of campaigns) {
          const insights = campaign.insights?.data?.[0] || {};
          const actions = insights.actions || [];
          const costPerAction = insights.cost_per_action_type || [];
          const actionValues = insights.action_values || [];
          
          console.log(`Campaign ${campaign.name} actions:`, JSON.stringify(actions).substring(0, 800));
          
          // Extract messaging conversations (match Ads Manager: "Conversas por mensagem" / "Custo por conversa")
          // The Ads Manager column uses the 7-day attribution action_type in most accounts.
          const conversationActionTypePrimary = "onsite_conversion.messaging_conversation_started_7d";
          const conversationActionTypeFallback = "messaging_conversation_started_7d";

          const conversationAction =
            actions.find((a: any) => a.action_type === conversationActionTypePrimary) ||
            actions.find((a: any) => a.action_type === conversationActionTypeFallback);

          const messagingConversations = conversationAction ? parseInt(conversationAction.value || 0) : 0;
          const chosenConversationActionType = conversationAction?.action_type ?? "n/a";

          // Cost per conversation: prefer API's cost_per_action_type for the exact same action_type.
          // If it's missing, fallback to spend / conversations.
          const costPerConversationAction = costPerAction.find(
            (a: any) => a.action_type === chosenConversationActionType
          );

          const costPerConversationFromApi = costPerConversationAction
            ? parseFloat(costPerConversationAction.value || 0)
            : 0;

          const costPerMessageValue =
            costPerConversationFromApi ||
            (messagingConversations > 0
              ? parseFloat(insights.spend || 0) / messagingConversations
              : 0);

          // Extract conversions + conversion value (match Ads Manager “Compras na Meta”)
          // We intentionally focus on purchases to avoid mismatches with other conversion types.
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

          console.log(
            `Campaign ${campaign.name} - reach: ${insights.reach}, conversations: ${messagingConversations} (${chosenConversationActionType}), costPerConversation: ${costPerMessageValue}, purchases: ${purchases}, purchaseValue: ${conversionValue}`
          );

          

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
            reach: parseInt(insights.reach || 0),
            cpm: parseFloat(insights.cpm || 0),
            ctr: parseFloat(insights.ctr || 0),
            cpc: parseFloat(insights.cost_per_inline_link_click || 0),
            cost_per_message: costPerMessageValue,
            messaging_conversations_started: parseInt(String(messagingConversations)),
            meta_conversions: purchases,
            conversion_value: conversionValue,
            cost_per_result: parseFloat(insights.cost_per_conversion || 0),
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
      }

      return new Response(
        JSON.stringify({ success: true, count: totalCampaigns }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update campaign status (pause/activate)
    if (action === "update_campaign_status") {
      const { campaignId, adAccountId, status } = body;

      // Get the ad account with Facebook account
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

      // Update campaign status on Facebook
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

      // Update local database
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

    // Update campaign budget
    if (action === "update_campaign_budget") {
      const { campaignId, adAccountId, daily_budget } = body;

      // Get the ad account with Facebook account
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

      // Update campaign budget on Facebook
      const updateUrl = `https://graph.facebook.com/v18.0/${campaignId}`;
      const updateResponse = await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daily_budget: Math.round(daily_budget), // Already in cents
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

      // Update local database
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
        // Get the ad account with Facebook account
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

        // Create campaign on Facebook
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

        // Save to database
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
