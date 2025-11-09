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

    // Calculate delay between requests (distribute over 1 hour)
    const delayMs = (60 * 60 * 1000) / totalOffers; // 1 hour in ms divided by number of offers
    const today = new Date().toISOString().split('T')[0];

    let processedCount = 0;
    let failedCount = 0;

    // Process each offer with delay
    for (const offer of offers as TrackedOffer[]) {
      try {
        console.log(`Processing offer ${offer.id}...`);

        // Call webhook with link parameter
        const webhookUrl = `https://webhook.chatwp.xyz/webhook/recebe-link?link=${encodeURIComponent(
          offer.ad_library_link
        )}`;

        const webhookResponse = await fetch(webhookUrl);
        const responseText = await webhookResponse.text();

        console.log(`Webhook response for ${offer.id}:`, responseText);

        // Parse response (expecting plain text number)
        const activeAdsCount = parseInt(responseText.trim()) || 0;

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

      // Wait before processing next offer (except for the last one)
      if (processedCount + failedCount < totalOffers) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
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
