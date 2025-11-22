import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrackedOffer {
  id: string;
  ad_library_link: string;
  user_id: string;
}

// Helper function to add delay between API calls
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const logSafe = (level: 'info' | 'error', message: string, metadata?: any) => {
  const sanitized = {
    ...metadata,
    offerId: metadata?.offerId ? `***${metadata.offerId.slice(-4)}` : undefined,
    userId: undefined,
    webhookResponse: metadata?.webhookResponse ? '[REDACTED]' : undefined,
  };
  console[level](message, sanitized);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    logSafe('error', 'Unauthorized access attempt', { code: 'AUTH_001' });
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    console.log('Starting daily update process...');

    // Mark update as running
    const { data: statusData, error: statusError } = await supabaseClient
      .from('daily_update_status')
      .insert({
        is_running: true,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (statusError) {
      console.error('Error creating status:', statusError);
      throw statusError;
    }

    const statusId = statusData.id;

    // Get all tracked offers
    const { data: offers, error: offersError } = await supabaseClient
      .from('tracked_offers')
      .select('id, ad_library_link, user_id');

    if (offersError) {
      console.error('Error fetching offers:', offersError);
      throw offersError;
    }

    const totalOffers = offers?.length || 0;
    console.log(`Found ${totalOffers} offers to update`);

    // Update total offers count
    await supabaseClient
      .from('daily_update_status')
      .update({ total_offers: totalOffers })
      .eq('id', statusId);

    if (!offers || offers.length === 0) {
      console.log('No offers to update');
      await supabaseClient
        .from('daily_update_status')
        .update({
          is_running: false,
          completed_at: new Date().toISOString(),
        })
        .eq('id', statusId);

      return new Response(
        JSON.stringify({ success: true, message: 'No offers to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];

    let processedCount = 0;
    let failedCount = 0;

    // Process all offers with delay and timeout
    for (const offer of offers as TrackedOffer[]) {
      try {
        console.log(`Processing offer ${offer.id}...`);

        // Call Apify API to scrape Facebook Ads
        const apifyToken = Deno.env.get('APIFY_API_TOKEN');
        const apifyUrl = `https://api.apify.com/v2/acts/XtaWFhbtfxyzqrFmd/run-sync-get-dataset-items?token=${apifyToken}`;
        
        const apifyBody = {
          count: 100,
          scrapeAdDetails: false,
          "scrapePageAds.activeStatus": "all",
          "scrapePageAds.countryCode": "ALL",
          urls: [
            {
              url: offer.ad_library_link
            }
          ],
          period: ""
        };

        console.log(`Calling Apify for offer ${offer.id}...`);
        
        // Create AbortController with 30s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        try {
          const apifyResponse = await fetch(apifyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(apifyBody),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!apifyResponse.ok) {
            const errorText = await apifyResponse.text();
            console.error(`Apify API error for ${offer.id}:`, errorText);
            throw new Error(`Apify API returned status ${apifyResponse.status}`);
          }

          const apifyData = await apifyResponse.json();
          console.log(`Apify response for ${offer.id}:`, JSON.stringify(apifyData).substring(0, 200));

          // Count active ads from the response
          // The response is an array of ad objects
          const activeAdsCount = Array.isArray(apifyData) ? apifyData.length : 0;

          // Check if metric already exists for today
          const { data: existingMetric } = await supabaseClient
            .from('offer_metrics')
            .select('id')
            .eq('offer_id', offer.id)
            .eq('date', today)
            .single();

          if (existingMetric) {
            // Update existing metric
            await supabaseClient
              .from('offer_metrics')
              .update({ active_ads_count: activeAdsCount })
              .eq('id', existingMetric.id);
          } else {
            // Insert new metric
            await supabaseClient.from('offer_metrics').insert({
              offer_id: offer.id,
              date: today,
              active_ads_count: activeAdsCount,
            });
          }

          processedCount++;
          console.log(
            `Successfully updated offer ${offer.id} with ${activeAdsCount} ads`
          );
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.error(`Timeout while processing offer ${offer.id}`);
          }
          throw fetchError;
        }
      } catch (error) {
        logSafe('error', 'Failed to process offer', { code: 'PROCESS_001', offerId: offer.id });
        failedCount++;
      }

      // Update progress
      await supabaseClient
        .from('daily_update_status')
        .update({
          processed_offers: processedCount,
          failed_offers: failedCount,
        })
        .eq('id', statusId);

      // Add 2 second delay between offers to prevent API overload
      if (processedCount + failedCount < totalOffers) {
        await sleep(2000);
      }
    }

    // Mark update as completed
    await supabaseClient
      .from('daily_update_status')
      .update({
        is_running: false,
        completed_at: new Date().toISOString(),
      })
      .eq('id', statusId);

    console.log(
      `Daily update completed. Processed: ${processedCount}, Failed: ${failedCount}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        failed: failedCount,
        total: totalOffers,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logSafe('error', 'Critical error in daily update', { code: 'CRITICAL_001' });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
