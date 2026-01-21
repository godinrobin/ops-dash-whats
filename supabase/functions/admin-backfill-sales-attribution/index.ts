import { createClient } from "npm:@supabase/supabase-js@2";
import { decode } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BackfillRequest = {
  date?: string; // YYYY-MM-DD (America/Sao_Paulo)
  limit?: number;
  dryRun?: boolean;
  userId?: string; // optional: restrict to one user
  syncAds?: boolean; // optionally refresh ads creative URLs before attribution
  maxAdPages?: number; // paging guard for Meta API
};

type MatchedAd = {
  ad_id: string;
  campaign_id: string;
  adset_id: string | null;
  ad_account_id: string | null; // uuid (internal)
  name?: string | null;
};

// NOTE: Keep edge function typing permissive.
// Supabase generated types are not available in this Deno runtime;
// using `any` avoids `never` inference errors during build.
type SupabaseAny = any;

function getSaoPauloDateString(now = new Date()): string {
  // YYYY-MM-DD
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function getDateRangeUtc(date: string) {
  const startLocal = new Date(`${date}T00:00:00-03:00`);
  const endLocal = new Date(`${date}T00:00:00-03:00`);
  endLocal.setDate(endLocal.getDate() + 1);
  return { startIso: startLocal.toISOString(), endIso: endLocal.toISOString() };
}

async function expandUrlMaybe(url: string): Promise<{ expandedUrl: string; urlsToMatch: string[] }> {
  const urlsToMatch = [url];
  let expandedUrl = url;

  try {
    const u = new URL(url);
    const isShortLink =
      u.hostname === "fb.me" ||
      u.hostname === "l.facebook.com" ||
      (u.hostname.includes("instagram.com") && u.pathname.startsWith("/p/"));

    if (!isShortLink) return { expandedUrl, urlsToMatch };

    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (res.url && res.url !== url) {
        expandedUrl = res.url;
        urlsToMatch.push(expandedUrl);
      }
    } catch {
      // ignore expansion failures
    }
  } catch {
    // ignore parse failures
  }

  return { expandedUrl, urlsToMatch };
}

function extractCandidatesFromUrl(url: string): { postIdsToMatch: string[] } {
  const postIdsToMatch: string[] = [];
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    const sp = u.searchParams;

    const storyFbid = sp.get("story_fbid");
    const postIdParam = sp.get("post_id");
    if (storyFbid) postIdsToMatch.push(storyFbid);
    if (postIdParam) {
      const parts = postIdParam.split("_");
      if (parts.length === 2) postIdsToMatch.push(parts[1]);
      postIdsToMatch.push(postIdParam);
    }

    const postMatch = pathname.match(/\/(\d+)\/posts\/(\d+)/);
    if (postMatch) {
      const [, _pageId, postId] = postMatch;
      postIdsToMatch.push(postId);
    }

    const igMatch = pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
    if (igMatch) postIdsToMatch.push(igMatch[1]);
  } catch {
    // ignore
  }
  return { postIdsToMatch: [...new Set(postIdsToMatch)] };
}

async function matchAdByCreativeUrl(opts: {
  supabase: SupabaseAny;
  userId: string;
  adSourceUrl: string;
}): Promise<MatchedAd | null> {
  const { supabase, userId, adSourceUrl } = opts;

  const { expandedUrl, urlsToMatch } = await expandUrlMaybe(adSourceUrl);
  const { postIdsToMatch } = extractCandidatesFromUrl(expandedUrl);

  // Strategy 1: postId/shortcode matching
  for (const postId of postIdsToMatch) {
    const { data: matchedAd } = await supabase
      .from("ads_ads")
      .select("ad_id, campaign_id, adset_id, name, ad_account_id")
      .eq("user_id", userId)
      .or(`effective_object_story_id.ilike.%${postId}%,ad_post_url.ilike.%${postId}%`)
      .limit(1)
      .maybeSingle();

    if (matchedAd?.ad_id && matchedAd?.campaign_id) {
      return {
        ad_id: matchedAd.ad_id,
        campaign_id: matchedAd.campaign_id,
        adset_id: matchedAd.adset_id ?? null,
        ad_account_id: matchedAd.ad_account_id ?? null,
        name: matchedAd.name ?? null,
      };
    }
  }

  // Strategy 2: cleaned URL matching
  for (const urlToMatch of urlsToMatch) {
    const cleanedUrl = urlToMatch.replace(/^https?:\/\/(www\.)?/, "").split("?")[0];
    const { data: matchedAd } = await supabase
      .from("ads_ads")
      .select("ad_id, campaign_id, adset_id, name, ad_account_id")
      .eq("user_id", userId)
      .ilike("ad_post_url", `%${cleanedUrl}%`)
      .limit(1)
      .maybeSingle();

    if (matchedAd?.ad_id && matchedAd?.campaign_id) {
      return {
        ad_id: matchedAd.ad_id,
        campaign_id: matchedAd.campaign_id,
        adset_id: matchedAd.adset_id ?? null,
        ad_account_id: matchedAd.ad_account_id ?? null,
        name: matchedAd.name ?? null,
      };
    }
  }

  // Strategy 3: prefix matching
  for (const postId of postIdsToMatch) {
    if (postId.length < 10) continue;
    const prefix = postId.substring(0, 10);
    const { data: matchedAd } = await supabase
      .from("ads_ads")
      .select("ad_id, campaign_id, adset_id, name, ad_account_id")
      .eq("user_id", userId)
      .ilike("effective_object_story_id", `%${prefix}%`)
      .limit(1)
      .maybeSingle();

    if (matchedAd?.ad_id && matchedAd?.campaign_id) {
      return {
        ad_id: matchedAd.ad_id,
        campaign_id: matchedAd.campaign_id,
        adset_id: matchedAd.adset_id ?? null,
        ad_account_id: matchedAd.ad_account_id ?? null,
        name: matchedAd.name ?? null,
      };
    }
  }

  return null;
}

async function syncAdPostUrlsForUsers(opts: {
  supabase: SupabaseAny;
  userIds: string[];
  maxPages: number;
}) {
  const { supabase, userIds, maxPages } = opts;
  let updated = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  for (const userId of userIds) {
    const { data: adAccounts, error: adAccountsError } = await supabase
      .from("ads_ad_accounts")
      .select("id, ad_account_id, is_selected, ads_facebook_accounts(access_token)")
      .eq("user_id", userId)
      .eq("is_selected", true);

    if (adAccountsError) {
      errors.push({ userId, error: `ads_ad_accounts: ${adAccountsError.message}` });
      continue;
    }

    for (const aa of adAccounts || []) {
      const accessToken = (aa as any)?.ads_facebook_accounts?.access_token as string | undefined;
      const metaAdAccountId = (aa as any)?.ad_account_id as string | undefined;
      if (!accessToken || !metaAdAccountId) continue;

      let nextUrl = `https://graph.facebook.com/v18.0/act_${metaAdAccountId}/ads?fields=id,name,campaign_id,adset_id,creative{effective_object_story_id,instagram_permalink_url}&limit=500&access_token=${accessToken}`;
      let pages = 0;

      while (nextUrl && pages < maxPages) {
        pages++;
        const res = await fetch(nextUrl);
        const json = await res.json();

        if (!res.ok || json?.error) {
          const msg = json?.error?.message || `HTTP ${res.status}`;
          errors.push({ userId, error: `Meta ads fetch: ${msg}` });
          break;
        }

        const ads = json?.data || [];
        for (const ad of ads) {
          const effectiveObjectStoryId = ad?.creative?.effective_object_story_id || null;
          const instagramPermalinkUrl = ad?.creative?.instagram_permalink_url || null;
          let adPostUrl: string | null = instagramPermalinkUrl;

          if (!adPostUrl && effectiveObjectStoryId && typeof effectiveObjectStoryId === "string") {
            const [pageId, postId] = effectiveObjectStoryId.split("_");
            if (pageId && postId) adPostUrl = `https://www.facebook.com/${pageId}/posts/${postId}`;
          }

          if (!adPostUrl && !effectiveObjectStoryId) continue;

          const { data: updatedRows, error: updErr } = await supabase
            .from("ads_ads")
            .update({
              ad_post_url: adPostUrl,
              effective_object_story_id: effectiveObjectStoryId,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("ad_id", String(ad.id))
            .select("id");

          if (updErr) {
            errors.push({ userId, error: `ads_ads update: ${updErr.message}` });
            continue;
          }

          if (!updatedRows || updatedRows.length === 0) {
            // If the ad isn't in our table yet, create a minimal row (best-effort)
            const { error: insErr } = await supabase.from("ads_ads").insert({
              user_id: userId,
              ad_account_id: (aa as any).id,
              ad_id: String(ad.id),
              name: ad?.name || null,
              campaign_id: ad?.campaign_id || null,
              adset_id: ad?.adset_id || null,
              status: null,
              creative_id: null,
              thumbnail_url: null,
              ad_post_url: adPostUrl,
              effective_object_story_id: effectiveObjectStoryId,
              last_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any);

            if (!insErr) updated++;
          } else {
            updated += updatedRows.length;
          }
        }

        nextUrl = json?.paging?.next || "";
      }
    }
  }

  return { updated, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const [_h, payload] = decode(token);
    const callerId = (payload as any)?.sub as string | undefined;
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as BackfillRequest;
    const date = body.date || getSaoPauloDateString();
    const limit = Math.min(Math.max(body.limit ?? 500, 1), 5000);
    const dryRun = !!body.dryRun;
    const syncAds = body.syncAds ?? true;
    const maxAdPages = Math.min(Math.max(body.maxAdPages ?? 3, 1), 10);

    const { startIso, endIso } = getDateRangeUtc(date);

    // Load leads needing attribution
    let q = supabase
      .from("ads_whatsapp_leads")
      .select("id,user_id,instance_id,phone,ad_source_url,ctwa_clid,ad_id,campaign_id,adset_id,ad_account_id,purchase_value,created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .or("campaign_id.is.null,ad_id.is.null")
      .limit(limit);

    if (body.userId) q = q.eq("user_id", body.userId);

    const { data: leads, error: leadsError } = await q;
    if (leadsError) {
      return new Response(JSON.stringify({ error: leadsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const leadsList = leads || [];
    const affectedUserIds = [...new Set(leadsList.map((l) => l.user_id).filter(Boolean))] as string[];

    // Optional: refresh ads creative URLs first
    let adsSync = { updated: 0, errors: [] as Array<{ userId: string; error: string }> };
    if (syncAds && affectedUserIds.length > 0) {
      adsSync = await syncAdPostUrlsForUsers({ supabase, userIds: affectedUserIds, maxPages: maxAdPages });
    }

    // Process leads
    let filledSourceUrl = 0;
    let attributed = 0;
    let updatedLeads = 0;
    const unmatchedSample: Array<{ leadId: string; phone: string; userId: string; ad_source_url: string | null }> = [];

    for (const lead of leadsList) {
      let adSourceUrl = lead.ad_source_url as string | null;
      let ctwa = (lead.ctwa_clid as string | null) || null;

      if (!adSourceUrl) {
        const { data: inboxContact } = await supabase
          .from("inbox_contacts")
          .select("ad_source_url, ctwa_clid")
          .eq("user_id", lead.user_id)
          .eq("phone", lead.phone)
          .eq("instance_id", lead.instance_id)
          .limit(1)
          .maybeSingle();

        if (inboxContact?.ad_source_url) {
          adSourceUrl = inboxContact.ad_source_url;
          ctwa = ctwa || inboxContact.ctwa_clid || null;
          filledSourceUrl++;

          if (!dryRun) {
            await supabase
              .from("ads_whatsapp_leads")
              .update({ ad_source_url: adSourceUrl, ctwa_clid: ctwa, updated_at: new Date().toISOString() })
              .eq("id", lead.id);
          }
        }
      }

      if (!adSourceUrl) {
        if (unmatchedSample.length < 20) {
          unmatchedSample.push({ leadId: lead.id, phone: lead.phone, userId: lead.user_id, ad_source_url: null });
        }
        continue;
      }

      const matched = await matchAdByCreativeUrl({ supabase, userId: lead.user_id, adSourceUrl });
      if (!matched) {
        if (unmatchedSample.length < 20) {
          unmatchedSample.push({ leadId: lead.id, phone: lead.phone, userId: lead.user_id, ad_source_url: adSourceUrl });
        }
        continue;
      }

      attributed++;

      const update: any = {
        updated_at: new Date().toISOString(),
      };
      if (!lead.ad_id) update.ad_id = matched.ad_id;
      if (!lead.campaign_id) update.campaign_id = matched.campaign_id;
      if (!lead.adset_id && matched.adset_id) update.adset_id = matched.adset_id;
      if (!lead.ad_account_id && matched.ad_account_id) update.ad_account_id = matched.ad_account_id;

      // Always persist ad_source_url if it exists (helps future debugging)
      if (!lead.ad_source_url && adSourceUrl) update.ad_source_url = adSourceUrl;
      if (!lead.ctwa_clid && ctwa) update.ctwa_clid = ctwa;

      if (!dryRun) {
        const { error: updErr } = await supabase.from("ads_whatsapp_leads").update(update).eq("id", lead.id);
        if (!updErr) updatedLeads++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date,
        dryRun,
        scanned: leadsList.length,
        affectedUsers: affectedUserIds.length,
        adsSync,
        filledSourceUrl,
        attributed,
        updatedLeads,
        unmatchedSample,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
