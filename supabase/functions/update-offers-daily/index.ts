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

// Helper function to validate Facebook Ad Library link
const isValidAdLibraryLink = (url: string): boolean => {
  if (!url || url.trim() === '') return false;
  
  // Must be a Facebook Ad Library URL
  if (!url.includes('facebook.com/ads/library')) return false;
  
  // Must have a specific page ID or ad ID, not a keyword search
  // Valid formats:
  // - ?id=123456 (specific ad)
  // - view_all_page_id=123456 (specific page)
  const hasSpecificId = url.includes('id=') && !url.includes('search_type=keyword');
  const hasPageId = url.includes('view_all_page_id=');
  
  return hasSpecificId || hasPageId;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    const today = new Date().toISOString().split('T')[0];
    const BATCH_SIZE = 3; // Process 3 offers per execution to avoid timeout

    console.log('Starting daily update process...');

    // First, check for stuck updates (running for more than 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckStatus } = await supabaseClient
      .from('daily_update_status')
      .select('*')
      .eq('is_running', true)
      .lt('started_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stuckStatus) {
      console.log(`Found stuck update from ${stuckStatus.started_at}. Marking as failed.`);
      await supabaseClient
        .from('daily_update_status')
        .update({
          is_running: false,
          completed_at: new Date().toISOString(),
        })
        .eq('id', stuckStatus.id);
    }

    // Check if there's already a running update for today
    const { data: existingStatus } = await supabaseClient
      .from('daily_update_status')
      .select('*')
      .eq('is_running', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let statusId: string;
    let currentProcessed = 0;
    let currentFailed = 0;

    if (existingStatus) {
      // Continue existing update
      statusId = existingStatus.id;
      currentProcessed = existingStatus.processed_offers || 0;
      currentFailed = existingStatus.failed_offers || 0;
      console.log(`Continuing existing update. Progress: ${currentProcessed} processed, ${currentFailed} failed`);
    } else {
      // Start new update
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
      statusId = statusData.id;
    }

    // Get all tracked offers
    const { data: allOffers, error: offersError } = await supabaseClient
      .from('tracked_offers')
      .select('id, ad_library_link, user_id');

    if (offersError) {
      console.error('Error fetching offers:', offersError);
      throw offersError;
    }

    const totalOffers = allOffers?.length || 0;

    // Update total offers count
    await supabaseClient
      .from('daily_update_status')
      .update({ total_offers: totalOffers })
      .eq('id', statusId);

    if (!allOffers || allOffers.length === 0) {
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

    // Get offers already processed today
    const { data: processedToday } = await supabaseClient
      .from('offer_metrics')
      .select('offer_id')
      .eq('date', today);

    const processedOfferIds = new Set(processedToday?.map(m => m.offer_id) || []);
    
    // Get offers that still need to be processed
    const offersToProcess = allOffers.filter(
      offer => !processedOfferIds.has(offer.id)
    );

    console.log(`Total offers: ${totalOffers}, Already processed today: ${processedOfferIds.size}, Remaining: ${offersToProcess.length}`);

    if (offersToProcess.length === 0) {
      console.log('All offers already processed today');
      await supabaseClient
        .from('daily_update_status')
        .update({
          is_running: false,
          completed_at: new Date().toISOString(),
        })
        .eq('id', statusId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All offers already processed',
          processed: totalOffers,
          failed: currentFailed,
          total: totalOffers,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Take only a batch of offers to process
    const batchToProcess = offersToProcess.slice(0, BATCH_SIZE);
    console.log(`Processing batch of ${batchToProcess.length} offers`);

    let processedCount = 0;
    let failedCount = 0;

    // Process batch of offers with delay and timeout
    for (const offer of batchToProcess as TrackedOffer[]) {
      try {
        console.log(`Processing offer ${offer.id}...`);
        
        // Validate offer link before processing
        if (!isValidAdLibraryLink(offer.ad_library_link)) {
          console.log(`Skipping offer ${offer.id}: invalid Ad Library link (${offer.ad_library_link.substring(0, 50)}...)`);
          
          // Insert a "failed" metric with 0 ads so this offer won't be retried today
          const { data: existingMetric } = await supabaseClient
            .from('offer_metrics')
            .select('id')
            .eq('offer_id', offer.id)
            .eq('date', today)
            .single();

          if (!existingMetric) {
            await supabaseClient.from('offer_metrics').insert({
              offer_id: offer.id,
              date: today,
              active_ads_count: 0,
              is_invalid_link: true,
            });
            console.log(`Marked offer ${offer.id} as processed with 0 ads (invalid link)`);
          }
          
          failedCount++;
          
          // Update progress immediately
          await supabaseClient
            .from('daily_update_status')
            .update({
              processed_offers: currentProcessed + processedCount,
              failed_offers: currentFailed + failedCount,
            })
            .eq('id', statusId);
          
          continue; // Skip this offer
        }

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
              is_invalid_link: false,
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
        
        // Insert a metric with 0 ads to mark this offer as attempted today
        // This prevents infinite retry loops on the same offer
        try {
          const { data: existingMetric } = await supabaseClient
            .from('offer_metrics')
            .select('id')
            .eq('offer_id', offer.id)
            .eq('date', today)
            .single();

          if (!existingMetric) {
            await supabaseClient.from('offer_metrics').insert({
              offer_id: offer.id,
              date: today,
              active_ads_count: 0,
              is_invalid_link: false,
            });
            console.log(`Marked offer ${offer.id} as failed (timeout/error) to prevent retry`);
          }
        } catch (insertError) {
          console.error(`Failed to insert failure metric for ${offer.id}:`, insertError);
        }
        
        failedCount++;
      }

      // Update progress with cumulative counts
      const newProcessedTotal = currentProcessed + processedCount;
      const newFailedTotal = currentFailed + failedCount;
      
      await supabaseClient
        .from('daily_update_status')
        .update({
          processed_offers: newProcessedTotal,
          failed_offers: newFailedTotal,
        })
        .eq('id', statusId);

      // Add 2 second delay between offers to prevent API overload
      if (processedCount + failedCount < batchToProcess.length) {
        await sleep(2000);
      }
    }

    const newProcessedTotal = currentProcessed + processedCount;
    const newFailedTotal = currentFailed + failedCount;
    const remainingOffers = offersToProcess.length - batchToProcess.length;

    // Check if all offers have been processed
    if (remainingOffers === 0) {
      // Mark update as completed
      await supabaseClient
        .from('daily_update_status')
        .update({
          is_running: false,
          completed_at: new Date().toISOString(),
          processed_offers: newProcessedTotal,
          failed_offers: newFailedTotal,
        })
        .eq('id', statusId);

      console.log(
        `Daily update completed. Total processed: ${newProcessedTotal}, Total failed: ${newFailedTotal}`
      );

      return new Response(
        JSON.stringify({
          success: true,
          completed: true,
          processed: newProcessedTotal,
          failed: newFailedTotal,
          total: totalOffers,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // More offers to process
      console.log(
        `Batch completed. Progress: ${newProcessedTotal}/${totalOffers} processed, ${newFailedTotal} failed, ${remainingOffers} remaining`
      );

      return new Response(
        JSON.stringify({
          success: true,
          completed: false,
          processed: newProcessedTotal,
          failed: newFailedTotal,
          total: totalOffers,
          remaining: remainingOffers,
          message: `Processed ${batchToProcess.length} offers. ${remainingOffers} remaining. Call again to continue.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    logSafe('error', 'Critical error in daily update', { code: 'CRITICAL_001', error: error instanceof Error ? error.message : String(error) });
    
    // CRITICAL: Always mark status as completed even on error
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      
      // Find and close any running status
      const { data: runningStatus } = await supabaseClient
        .from('daily_update_status')
        .select('id')
        .eq('is_running', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (runningStatus) {
        await supabaseClient
          .from('daily_update_status')
          .update({
            is_running: false,
            completed_at: new Date().toISOString(),
          })
          .eq('id', runningStatus.id);
        
        console.log('Marked failed update as completed');
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', completed: true }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
