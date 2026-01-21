import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SimplePayload {
  numbers: string[];
  type: string;
  text?: string;
  file?: string;
  docName?: string;
  folder: string;
  delayMin: number;
  delayMax: number;
  scheduled_for: number;
  info?: string;
}

interface AdvancedMessage {
  number: string;
  type: string;
  text?: string;
  file?: string;
  docName?: string;
}

interface AdvancedPayload {
  delayMin: number;
  delayMax: number;
  info?: string;
  scheduled_for: number;
  messages: AdvancedMessage[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, campaignId, instanceId, ...params } = await req.json();
    console.log(`UAZAPI Sender action: ${action}`);

    // Get instance details for authentication
    const getInstanceToken = async (instId: string) => {
      const { data: instance, error } = await supabaseClient
        .from('maturador_instances')
        .select('instance_name, uazapi_token, api_provider')
        .eq('id', instId)
        .single();

      if (error || !instance) {
        throw new Error('Instance not found');
      }

      // For UAZAPI, get base URL from whatsapp_api_config
      let baseUrl = '';
      
      const { data: apiConfig } = await supabaseClient
        .from('whatsapp_api_config')
        .select('uazapi_base_url')
        .limit(1)
        .single();

      if (apiConfig?.uazapi_base_url) {
        baseUrl = apiConfig.uazapi_base_url.replace(/\/$/, '');
        console.log(`Using UAZAPI base URL from whatsapp_api_config: ${baseUrl}`);
      }

      // Fallback to maturador_config if whatsapp_api_config not available
      if (!baseUrl) {
        const { data: config } = await supabaseClient
          .from('maturador_config')
          .select('evolution_base_url')
          .limit(1)
          .single();
        
        baseUrl = config?.evolution_base_url?.replace(/\/$/, '') || '';
      }

      return {
        token: instance.uazapi_token,
        baseUrl,
        instanceName: instance.instance_name,
        apiProvider: instance.api_provider
      };
    };

    switch (action) {
      case 'create-simple': {
        // Create a simple campaign using /sender/simple
        const { token, baseUrl } = await getInstanceToken(instanceId);
        
        if (!baseUrl) {
          throw new Error('UAZAPI base URL not configured');
        }

        const payload: SimplePayload = {
          numbers: params.numbers.map((n: string) => {
            const cleaned = n.replace(/\D/g, '');
            return cleaned.includes('@') ? cleaned : `${cleaned}@s.whatsapp.net`;
          }),
          type: params.mediaType || 'text',
          folder: params.campaignName || `Campaign_${Date.now()}`,
          delayMin: params.delayMin || 5,
          delayMax: params.delayMax || 15,
          scheduled_for: params.scheduledFor || 1, // 1 = start immediately (1 minute from now)
          info: params.info || '',
        };

        // Add content based on type
        if (payload.type === 'text') {
          payload.text = params.message || '';
        } else {
          payload.file = params.mediaUrl || '';
          payload.text = params.caption || '';
          if (payload.type === 'document') {
            payload.docName = params.fileName || 'document';
          }
        }

        console.log('Creating simple campaign:', JSON.stringify(payload));

        const response = await fetch(`${baseUrl}/sender/simple`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': token,
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log('UAZAPI simple campaign response:', JSON.stringify(result));

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create campaign');
        }

        // Update campaign with folder_id from UAZAPI
        if (campaignId && result.folder_id) {
          await supabaseClient
            .from('blaster_campaigns')
            .update({ 
              uazapi_folder_id: result.folder_id,
              status: 'running',
              started_at: new Date().toISOString()
            })
            .eq('id', campaignId);
        }

        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create-advanced': {
        // Create an advanced campaign using /sender/advanced
        const { token, baseUrl } = await getInstanceToken(instanceId);
        
        if (!baseUrl) {
          throw new Error('UAZAPI base URL not configured');
        }

        const messages: AdvancedMessage[] = params.messages.map((msg: any) => {
          const cleaned = msg.number.replace(/\D/g, '');
          const formattedNumber = cleaned.includes('@') ? cleaned : cleaned;
          
          const message: AdvancedMessage = {
            number: formattedNumber,
            type: msg.type || 'text',
          };

          if (message.type === 'text') {
            message.text = msg.text || '';
          } else {
            message.file = msg.file || msg.mediaUrl || '';
            message.text = msg.caption || msg.text || '';
            if (message.type === 'document') {
              message.docName = msg.docName || msg.fileName || 'document';
            }
          }

          return message;
        });

        const payload: AdvancedPayload = {
          delayMin: params.delayMin || 5,
          delayMax: params.delayMax || 15,
          scheduled_for: params.scheduledFor || 1,
          info: params.info || params.campaignName || '',
          messages,
        };

        console.log('Creating advanced campaign with', messages.length, 'messages');

        const response = await fetch(`${baseUrl}/sender/advanced`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': token,
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log('UAZAPI advanced campaign response:', JSON.stringify(result));

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create advanced campaign');
        }

        // Update campaign with folder_id from UAZAPI
        if (campaignId && result.folder_id) {
          await supabaseClient
            .from('blaster_campaigns')
            .update({ 
              uazapi_folder_id: result.folder_id,
              status: 'running',
              started_at: new Date().toISOString()
            })
            .eq('id', campaignId);
        }

        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'control': {
        // Control campaign (pause/continue/delete) using /sender/edit
        const { token, baseUrl } = await getInstanceToken(instanceId);
        const folderId = params.folderId;
        const controlAction = params.controlAction; // 'stop', 'continue', 'delete'

        if (!folderId) {
          throw new Error('folder_id is required');
        }

        console.log(`Controlling campaign ${folderId}: ${controlAction}`);

        const response = await fetch(`${baseUrl}/sender/edit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': token,
          },
          body: JSON.stringify({
            folder_id: folderId,
            action: controlAction,
          }),
        });

        const result = await response.json();
        console.log('UAZAPI control response:', JSON.stringify(result));

        if (!response.ok) {
          throw new Error(result.error || 'Failed to control campaign');
        }

        // Update local campaign status based on action
        if (campaignId) {
          let status = 'running';
          if (controlAction === 'stop') status = 'paused';
          if (controlAction === 'delete') status = 'cancelled';

          await supabaseClient
            .from('blaster_campaigns')
            .update({ status })
            .eq('id', campaignId);
        }

        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list-folders': {
        // List campaigns using /sender/listfolders
        const { token, baseUrl } = await getInstanceToken(instanceId);
        const status = params.status || ''; // 'Active' or 'Archived'

        const url = status 
          ? `${baseUrl}/sender/listfolders?status=${status}`
          : `${baseUrl}/sender/listfolders`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'token': token,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to list folders');
        }

        return new Response(
          JSON.stringify({ success: true, folders: result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list-messages': {
        // List messages in a campaign using /sender/listmessages
        const { token, baseUrl } = await getInstanceToken(instanceId);
        const folderId = params.folderId;
        const messageStatus = params.messageStatus || ''; // 'scheduled', 'sent', 'failed'

        if (!folderId) {
          throw new Error('folder_id is required');
        }

        const response = await fetch(`${baseUrl}/sender/listmessages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': token,
          },
          body: JSON.stringify({
            folder_id: folderId,
            status: messageStatus,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to list messages');
        }

        return new Response(
          JSON.stringify({ success: true, messages: result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sync-status': {
        // Sync campaign status from UAZAPI to Supabase
        const { token, baseUrl } = await getInstanceToken(instanceId);
        const folderId = params.folderId;

        if (!folderId) {
          throw new Error('folder_id is required');
        }

        // Get folder list to find this campaign's status
        const response = await fetch(`${baseUrl}/sender/listfolders`, {
          method: 'GET',
          headers: {
            'token': token,
          },
        });

        const folders = await response.json();

        if (!response.ok) {
          throw new Error('Failed to fetch folders');
        }

        // Find the folder
        const folder = folders.find((f: any) => f.id === folderId);
        
        if (!folder) {
          // Campaign might be completed/deleted
          if (campaignId) {
            await supabaseClient
              .from('blaster_campaigns')
              .update({ 
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('id', campaignId);
          }
          return new Response(
            JSON.stringify({ success: true, status: 'completed', notFound: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Map UAZAPI status to our status
        let localStatus = 'running';
        switch (folder.status) {
          case 'scheduled': localStatus = 'running'; break;
          case 'sending': localStatus = 'running'; break;
          case 'paused': localStatus = 'paused'; break;
          case 'done': localStatus = 'completed'; break;
          case 'deleting': localStatus = 'cancelled'; break;
        }

        // Update local campaign
        if (campaignId) {
          const updateData: any = {
            status: localStatus,
            sent_count: folder.sent_count || folder.countSent || 0,
            failed_count: folder.failed_count || folder.countFailed || 0,
          };

          if (localStatus === 'completed') {
            updateData.completed_at = new Date().toISOString();
          }

          await supabaseClient
            .from('blaster_campaigns')
            .update(updateData)
            .eq('id', campaignId);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: localStatus,
            uazapiStatus: folder.status,
            sentCount: folder.sent_count || folder.countSent || 0,
            failedCount: folder.failed_count || folder.countFailed || 0,
            totalCount: folder.total_count || folder.countTotal || 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('UAZAPI Sender error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
