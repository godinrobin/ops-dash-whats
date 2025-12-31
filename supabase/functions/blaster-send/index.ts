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
    let { data: config } = await supabaseClient
      .from('maturador_config')
      .select('*')
      .eq('user_id', campaign.user_id)
      .single();

    // If user doesn't have config, fallback to admin config
    if (!config?.evolution_base_url || !config?.evolution_api_key) {
      console.log('User has no Evolution API config, trying admin fallback...');
      
      const { data: adminConfig } = await supabaseClient
        .from('maturador_config')
        .select('*')
        .limit(1)
        .single();
      
      if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
        config = adminConfig;
        console.log('Using admin Evolution API config as fallback');
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'Evolution API not configured and no admin fallback available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log('Using user Evolution API config');
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
      .select('*, api_provider, uazapi_token')
      .in('id', assignedInstanceIds)
      .in('status', ['connected', 'open']);

    if (!instances || instances.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No connected instances found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${instances.length} connected instances`);

    // Check if campaign uses a flow
    const flowId = campaign.flow_id;
    let flow: any = null;
    
    if (flowId) {
      const { data: flowData, error: flowError } = await supabaseClient
        .from('inbox_flows')
        .select('*')
        .eq('id', flowId)
        .single();
      
      if (flowError || !flowData) {
        console.error('Flow not found:', flowError);
        return new Response(
          JSON.stringify({ success: false, error: 'Flow not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      flow = flowData;
      console.log(`Using flow: ${flow.name} (${flowId})`);
    }

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
    const mediaType = campaign.media_type || 'text';
    const mediaUrl = campaign.media_url || '';
    const dispatchesPerInstance = campaign.dispatches_per_instance || 1;
    let currentIndex = campaign.current_index || 0;
    let sentCount = campaign.sent_count || 0;
    let failedCount = campaign.failed_count || 0;

    // Process messages in batches
    const batchSize = flowId ? 5 : 10; // Smaller batch for flows since they have more processing
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
      
      // Calculate which instance to use based on dispatches_per_instance
      const instanceIndex = Math.floor(i / dispatchesPerInstance) % instances.length;
      const instance = instances[instanceIndex];

      try {
        if (flowId && flow) {
          // Execute flow for this contact
          console.log(`Executing flow for ${phone} via ${instance.instance_name}`);
          
          await executeFlowForContact(
            supabaseClient,
            config,
            flow,
            phone,
            instance,
            campaign.user_id
          );
          
          sentCount++;
          console.log(`Flow executed for ${phone}`);
          
          // Log success
          await supabaseClient
            .from('blaster_logs')
            .insert({
              campaign_id: campaignId,
              user_id: campaign.user_id,
              phone,
              message: `[Fluxo] ${flow.name}`,
              instance_id: instance.id,
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
        } else {
          // Regular message sending
          const message = messageVariations.length > 0 
            ? messageVariations[Math.floor(Math.random() * messageVariations.length)]
            : '';

          const apiProvider = instance.api_provider || 'evolution';
          const baseUrl = config.evolution_base_url?.replace(/\/$/, '') || '';
          let apiEndpoint: string;
          let body: any;
          let authHeader: Record<string, string>;

          if (apiProvider === 'uazapi') {
            // UazAPI v2 endpoints (per OpenAPI spec) - use token header
            authHeader = { 'token': instance.uazapi_token || config.evolution_api_key };
            
            switch (mediaType) {
              case 'image':
                apiEndpoint = `${baseUrl}/message/sendMedia`;
                body = { number: phone, mediatype: 'image', media: mediaUrl, caption: message };
                break;
              case 'video':
                apiEndpoint = `${baseUrl}/message/sendMedia`;
                body = { number: phone, mediatype: 'video', media: mediaUrl, caption: message };
                break;
              case 'audio':
                apiEndpoint = `${baseUrl}/message/sendAudio`;
                body = { number: phone, audio: mediaUrl };
                break;
              case 'document':
                apiEndpoint = `${baseUrl}/message/sendMedia`;
                body = { number: phone, mediatype: 'document', media: mediaUrl, caption: message, fileName: 'document' };
                break;
              default: // text
                apiEndpoint = `${baseUrl}/message/sendText`;
                body = { number: phone, text: message };
            }
          } else {
            // Evolution API endpoints - use apikey header
            authHeader = { 'apikey': config.evolution_api_key };
            
            switch (mediaType) {
              case 'image':
                apiEndpoint = `${baseUrl}/message/sendMedia/${instance.instance_name}`;
                body = { number: phone, mediatype: 'image', media: mediaUrl, caption: message };
                break;
              case 'video':
                apiEndpoint = `${baseUrl}/message/sendMedia/${instance.instance_name}`;
                body = { number: phone, mediatype: 'video', media: mediaUrl, caption: message };
                break;
              case 'audio':
                apiEndpoint = `${baseUrl}/message/sendWhatsAppAudio/${instance.instance_name}`;
                body = { number: phone, audio: mediaUrl };
                break;
              case 'document':
                apiEndpoint = `${baseUrl}/message/sendMedia/${instance.instance_name}`;
                body = { number: phone, mediatype: 'document', media: mediaUrl, caption: message, fileName: 'document' };
                break;
              default: // text
                apiEndpoint = `${baseUrl}/message/sendText/${instance.instance_name}`;
                body = { number: phone, text: message };
            }
          }
          
          console.log(`[${apiProvider.toUpperCase()}] Sending ${mediaType} to ${phone} via ${instance.instance_name}`);
          
          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeader,
            },
            body: JSON.stringify(body),
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
                message: message || `[${mediaType}] ${mediaUrl}`,
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
                message: message || `[${mediaType}] ${mediaUrl}`,
                instance_id: instance.id,
                status: 'failed',
                error_message: errorText.substring(0, 500),
              });
          }
        }
      } catch (error: any) {
        failedCount++;
        console.error(`Error processing ${phone}:`, error.message);
        
        await supabaseClient
          .from('blaster_logs')
          .insert({
            campaign_id: campaignId,
            user_id: campaign.user_id,
            phone,
            message: flowId ? `[Fluxo] ${flow?.name || 'Erro'}` : (messageVariations[0] || `[${mediaType}]`),
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
        const delay = delayMin === delayMax 
          ? delayMin 
          : Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
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

// Helper function to execute a flow for a single contact
async function executeFlowForContact(
  supabaseClient: any,
  config: any,
  flow: any,
  phone: string,
  instance: any,
  userId: string
) {
  const nodes = flow.nodes as Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }>;
  const edges = flow.edges as Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
  }>;

  const formattedPhone = phone.replace(/\D/g, '');
  const variables: Record<string, unknown> = {
    phone: formattedPhone,
    nome: '',
  };

  // Find the start node
  let currentNodeId = nodes.find(n => n.type === 'start')?.id || 'start-1';
  let continueProcessing = true;
  let nodeCount = 0;
  const maxNodes = 50; // Prevent infinite loops

  while (continueProcessing && nodeCount < maxNodes) {
    nodeCount++;
    const currentNode = nodes.find(n => n.id === currentNodeId);
    
    if (!currentNode) {
      console.log('Node not found, ending flow');
      break;
    }

    console.log(`[${phone}] Processing node: ${currentNode.type} (${currentNodeId})`);

    switch (currentNode.type) {
      case 'start':
        const startEdge = edges.find(e => e.source === currentNodeId);
        currentNodeId = startEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
        break;

      case 'text':
        const message = replaceVariables(currentNode.data.message as string || '', variables);
        if (message) {
          await sendMessage(config, instance.instance_name, formattedPhone, message, 'text', undefined, undefined, instance.api_provider || 'evolution', instance.uazapi_token);
        }
        
        const textEdge = edges.find(e => e.source === currentNodeId);
        currentNodeId = textEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
        break;

      case 'image':
      case 'video':
      case 'document':
        const mediaUrl = currentNode.data.mediaUrl as string;
        const caption = replaceVariables(currentNode.data.caption as string || '', variables);
        const fileName = currentNode.data.fileName as string || '';
        
        if (mediaUrl) {
          await sendMessage(config, instance.instance_name, formattedPhone, caption, currentNode.type, mediaUrl, fileName, instance.api_provider || 'evolution', instance.uazapi_token);
        }
        
        const mediaEdge = edges.find(e => e.source === currentNodeId);
        currentNodeId = mediaEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
        break;

      case 'audio':
        const audioUrl = currentNode.data.mediaUrl as string;
        if (audioUrl) {
          await sendMessage(config, instance.instance_name, formattedPhone, '', 'audio', audioUrl, undefined, instance.api_provider || 'evolution', instance.uazapi_token);
        }
        
        const audioEdge = edges.find(e => e.source === currentNodeId);
        currentNodeId = audioEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
        break;

      case 'delay':
        const delayType = (currentNode.data.delayType as string) || 'fixed';
        const unit = (currentNode.data.unit as string) || 'seconds';
        
        let delay: number;
        if (delayType === 'variable') {
          const minDelay = (currentNode.data.minDelay as number) || 5;
          const maxDelay = (currentNode.data.maxDelay as number) || 15;
          delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        } else {
          delay = (currentNode.data.delay as number) || 5;
        }
        
        let delayMs = delay * 1000;
        if (unit === 'minutes') delayMs = delay * 60 * 1000;
        if (unit === 'hours') delayMs = delay * 60 * 60 * 1000;
        
        // Cap delay at 10 seconds for blaster (to keep batch processing reasonable)
        const maxDelayMs = 10000;
        const actualDelayMs = Math.min(delayMs, maxDelayMs);
        
        console.log(`[${phone}] Delay: ${actualDelayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, actualDelayMs));
        
        const delayEdge = edges.find(e => e.source === currentNodeId);
        currentNodeId = delayEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
        break;

      case 'setVariable':
        const varName = currentNode.data.variableName as string || '';
        const varVal = replaceVariables(currentNode.data.value as string || '', variables);
        if (varName) {
          variables[varName] = varVal;
        }
        
        const setVarEdge = edges.find(e => e.source === currentNodeId);
        currentNodeId = setVarEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
        break;

      case 'condition':
        const variable = currentNode.data.variable as string || '';
        const operator = currentNode.data.operator as string || 'equals';
        const compareValue = currentNode.data.value as string || '';
        
        const varValue = String(variables[variable.replace(/[{}]/g, '')] || '');
        let conditionMet = false;
        
        switch (operator) {
          case 'equals':
            conditionMet = varValue === compareValue;
            break;
          case 'contains':
            conditionMet = varValue.includes(compareValue);
            break;
          case 'startsWith':
            conditionMet = varValue.startsWith(compareValue);
            break;
          case 'endsWith':
            conditionMet = varValue.endsWith(compareValue);
            break;
          case 'greater':
            conditionMet = parseFloat(varValue) > parseFloat(compareValue);
            break;
          case 'less':
            conditionMet = parseFloat(varValue) < parseFloat(compareValue);
            break;
        }
        
        const conditionEdge = edges.find(e => 
          e.source === currentNodeId && 
          e.sourceHandle === (conditionMet ? 'yes' : 'no')
        );
        
        currentNodeId = conditionEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
        break;

      case 'waitInput':
      case 'menu':
        // For blaster, skip interactive nodes - just move to the first connected edge
        console.log(`[${phone}] Skipping interactive node: ${currentNode.type}`);
        const skipEdge = edges.find(e => e.source === currentNodeId);
        currentNodeId = skipEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
        break;

      case 'transfer':
      case 'end':
        console.log(`[${phone}] Flow completed at: ${currentNode.type}`);
        continueProcessing = false;
        break;

      default:
        const defaultEdge = edges.find(e => e.source === currentNodeId);
        currentNodeId = defaultEdge?.target || '';
        if (!currentNodeId) continueProcessing = false;
    }
  }

  console.log(`[${phone}] Flow execution complete. Processed ${nodeCount} nodes.`);
}

function replaceVariables(text: string, variables: Record<string, unknown>): string {
  return text
    .replace(/\{\{(\w+)\}\}/g, (_, key) => String(variables[key] || ''))
    .replace(/\{(\w+)\}/g, (_, key) => String(variables[key] || ''));
}

async function sendMessage(
  config: any,
  instanceName: string, 
  phone: string, 
  content: string, 
  messageType: string, 
  mediaUrl?: string,
  fileName?: string,
  apiProvider: string = 'evolution',
  instanceToken?: string
) {
  let endpoint = '';
  let body: Record<string, unknown> = {};
  let authHeader: Record<string, string> = {};

  // Determine base URL based on provider
  const baseUrl = config.evolution_base_url?.replace(/\/$/, '') || '';

  if (apiProvider === 'uazapi') {
    // UazAPI v2 endpoints (per OpenAPI spec) - use token header
    authHeader = { 'token': instanceToken || config.evolution_api_key };
    
    switch (messageType) {
      case 'text':
        endpoint = '/message/sendText';
        body = { number: phone, text: content };
        break;
      case 'image':
        endpoint = '/message/sendMedia';
        body = { number: phone, mediatype: 'image', media: mediaUrl, caption: content };
        break;
      case 'audio':
        endpoint = '/message/sendAudio';
        body = { number: phone, audio: mediaUrl };
        break;
      case 'video':
        endpoint = '/message/sendMedia';
        body = { number: phone, mediatype: 'video', media: mediaUrl, caption: content };
        break;
      case 'document':
        endpoint = '/message/sendMedia';
        body = { number: phone, mediatype: 'document', media: mediaUrl, fileName: fileName || 'document', caption: content };
        break;
      default:
        endpoint = '/message/sendText';
        body = { number: phone, text: content };
    }
  } else {
    // Evolution API endpoints - use apikey header
    authHeader = { 'apikey': config.evolution_api_key };
    
    switch (messageType) {
      case 'text':
        endpoint = `/message/sendText/${instanceName}`;
        body = { number: phone, text: content };
        break;
      case 'image':
        endpoint = `/message/sendMedia/${instanceName}`;
        body = { number: phone, mediatype: 'image', media: mediaUrl, caption: content };
        break;
      case 'audio':
        endpoint = `/message/sendWhatsAppAudio/${instanceName}`;
        body = { number: phone, audio: mediaUrl };
        break;
      case 'video':
        endpoint = `/message/sendMedia/${instanceName}`;
        body = { number: phone, mediatype: 'video', media: mediaUrl, caption: content };
        break;
      case 'document':
        endpoint = `/message/sendMedia/${instanceName}`;
        body = { 
          number: phone, 
          mediatype: 'document', 
          media: mediaUrl, 
          fileName: fileName || 'document',
          caption: content 
        };
        break;
      default:
        endpoint = `/message/sendText/${instanceName}`;
        body = { number: phone, text: content };
    }
  }

  console.log(`[${apiProvider.toUpperCase()}] Sending ${messageType} to ${phone} via ${endpoint}`);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send ${messageType}: ${errorText}`);
  }

  return response;
}
