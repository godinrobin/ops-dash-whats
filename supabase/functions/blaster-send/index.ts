import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { campaignId, action } = await req.json();
    console.log(`Blaster action: ${action} for campaign ${campaignId}`);

    if (!campaignId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Campaign ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('blaster_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error('Campaign not found:', campaignError);
      return new Response(
        JSON.stringify({ success: false, error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user's Evolution API config
    const { data: config } = await supabaseClient
      .from('maturador_config')
      .select('*')
      .eq('user_id', campaign.user_id)
      .single();

    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Evolution API not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch assigned instances
    const assignedInstanceIds = campaign.assigned_instances || [];
    if (assignedInstanceIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No instances assigned' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: instances } = await supabaseClient
      .from('maturador_instances')
      .select('*')
      .in('id', assignedInstanceIds)
      .in('status', ['connected', 'open']);

    if (!instances || instances.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No connected instances found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${instances.length} connected instances`);

    // Update campaign status to running
    await supabaseClient
      .from('blaster_campaigns')
      .update({ 
        status: 'running',
        started_at: campaign.started_at || new Date().toISOString()
      })
      .eq('id', campaignId);

    const phoneNumbers = campaign.phone_numbers as string[];
    const messageVariations = campaign.message_variations as string[];
    const delayMin = campaign.delay_min || 5;
    const delayMax = campaign.delay_max || 15;
    let currentIndex = campaign.current_index || 0;
    let sentCount = campaign.sent_count || 0;
    let failedCount = campaign.failed_count || 0;

    // Process messages in batches
    const batchSize = 10; // Process 10 messages per function call
    const endIndex = Math.min(currentIndex + batchSize, phoneNumbers.length);
    
    console.log(`Processing messages from index ${currentIndex} to ${endIndex}`);

    for (let i = currentIndex; i < endIndex; i++) {
      // Check if campaign was paused/cancelled
      const { data: currentCampaign } = await supabaseClient
        .from('blaster_campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();

      if (currentCampaign?.status !== 'running') {
        console.log(`Campaign ${campaignId} was stopped`);
        break;
      }

      const phone = phoneNumbers[i];
      const message = messageVariations[Math.floor(Math.random() * messageVariations.length)];
      const instance = instances[i % instances.length];

      try {
        // Send message via Evolution API
        const evolutionUrl = `${config.evolution_base_url}/message/sendText/${instance.instance_name}`;
        
        const response = await fetch(evolutionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.evolution_api_key,
          },
          body: JSON.stringify({
            number: phone,
            text: message,
          }),
        });

        if (response.ok) {
          sentCount++;
          console.log(`Message sent to ${phone} via ${instance.instance_name}`);
          
          // Log success
          await supabaseClient
            .from('blaster_logs')
            .insert({
              campaign_id: campaignId,
              user_id: campaign.user_id,
              phone,
              message,
              instance_id: instance.id,
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
        } else {
          const errorText = await response.text();
          failedCount++;
          console.error(`Failed to send to ${phone}:`, errorText);
          
          // Log failure
          await supabaseClient
            .from('blaster_logs')
            .insert({
              campaign_id: campaignId,
              user_id: campaign.user_id,
              phone,
              message,
              instance_id: instance.id,
              status: 'failed',
              error_message: errorText.substring(0, 500),
            });
        }
      } catch (error: any) {
        failedCount++;
        console.error(`Error sending to ${phone}:`, error.message);
        
        await supabaseClient
          .from('blaster_logs')
          .insert({
            campaign_id: campaignId,
            user_id: campaign.user_id,
            phone,
            message,
            status: 'failed',
            error_message: error.message,
          });
      }

      // Update progress
      currentIndex = i + 1;
      await supabaseClient
        .from('blaster_campaigns')
        .update({
          current_index: currentIndex,
          sent_count: sentCount,
          failed_count: failedCount,
        })
        .eq('id', campaignId);

      // Random delay between messages
      if (i < endIndex - 1) {
        const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        console.log(`Waiting ${delay} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    }

    // Check if campaign is complete
    if (currentIndex >= phoneNumbers.length) {
      await supabaseClient
        .from('blaster_campaigns')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
      
      console.log(`Campaign ${campaignId} completed!`);
    } else {
      // Schedule next batch
      console.log(`Campaign ${campaignId} - batch complete, ${phoneNumbers.length - currentIndex} remaining`);
      
      // Call this function again for the next batch
      const nextBatchUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/blaster-send`;
      fetch(nextBatchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ campaignId, action: 'continue' }),
      }).catch(err => console.error('Error scheduling next batch:', err));
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: endIndex - (campaign.current_index || 0),
        sentCount,
        failedCount,
        remaining: phoneNumbers.length - currentIndex
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Blaster error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});