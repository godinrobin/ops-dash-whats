import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  source: string;
}

// Get Evolution API config for an instance (priority: instance > user > admin > global env)
const getEvolutionConfig = async (
  supabaseClient: any,
  instanceId: string,
  userId: string
): Promise<EvolutionConfig | null> => {
  // 1. Check instance-specific config
  const { data: instance } = await supabaseClient
    .from('maturador_instances')
    .select('evolution_base_url, evolution_api_key')
    .eq('id', instanceId)
    .single();

  if (instance?.evolution_base_url && instance?.evolution_api_key) {
    return {
      baseUrl: instance.evolution_base_url,
      apiKey: instance.evolution_api_key,
      source: 'instance'
    };
  }

  // 2. Check user-specific config
  const { data: userConfig } = await supabaseClient
    .from('maturador_config')
    .select('evolution_base_url, evolution_api_key')
    .eq('user_id', userId)
    .single();

  if (userConfig?.evolution_base_url && userConfig?.evolution_api_key) {
    return {
      baseUrl: userConfig.evolution_base_url,
      apiKey: userConfig.evolution_api_key,
      source: 'user'
    };
  }

  // 3. Check admin config (first admin user's config as fallback)
  const { data: adminUsers } = await supabaseClient
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
    .limit(1);

  if (adminUsers && adminUsers.length > 0) {
    const { data: adminConfig } = await supabaseClient
      .from('maturador_config')
      .select('evolution_base_url, evolution_api_key')
      .eq('user_id', adminUsers[0].user_id)
      .single();

    if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
      return {
        baseUrl: adminConfig.evolution_base_url,
        apiKey: adminConfig.evolution_api_key,
        source: 'admin'
      };
    }
  }

  // 4. Fallback to global environment variables
  const globalBaseUrl = Deno.env.get('EVOLUTION_BASE_URL');
  const globalApiKey = Deno.env.get('EVOLUTION_API_KEY');

  if (globalBaseUrl && globalApiKey) {
    return {
      baseUrl: globalBaseUrl,
      apiKey: globalApiKey,
      source: 'global'
    };
  }

  return null;
};

// Delete existing webhook configuration
const deleteWebhook = async (baseUrl: string, apiKey: string, instanceName: string): Promise<boolean> => {
  try {
    const url = `${baseUrl}/webhook/set/${instanceName}`;
    console.log(`[DELETE-WEBHOOK] Deleting webhook for ${instanceName}: ${url}`);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
    });

    const responseText = await response.text();
    console.log(`[DELETE-WEBHOOK] Response: ${response.status} - ${responseText}`);
    
    return response.ok || response.status === 404; // 404 = already deleted
  } catch (error) {
    console.error(`[DELETE-WEBHOOK] Error:`, error);
    return false;
  }
};

// Configure new webhook
const configureWebhook = async (baseUrl: string, apiKey: string, instanceName: string): Promise<boolean> => {
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-inbox-messages`;
  
  // Different endpoint/payload combinations to try
  const attempts = [
    // Attempt 1: Evolution API v2 - POST /webhook/set/{instanceName}
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE', 
          'CONNECTION_UPDATE',
          'SEND_MESSAGE'
        ]
      }
    },
    // Attempt 2: Evolution API v2 - PUT /webhook/set/{instanceName}
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'PUT',
      payload: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE', 
          'CONNECTION_UPDATE',
          'SEND_MESSAGE'
        ]
      }
    },
    // Attempt 3: Evolution API v1 style - POST /webhook/instance/{instanceName}
    {
      endpoint: `/webhook/instance/${instanceName}`,
      method: 'POST',
      payload: {
        webhook: {
          url: webhookUrl,
          enabled: true,
          events: [
            'messages.upsert',
            'messages.update',
            'connection.update',
            'send.message'
          ]
        }
      }
    },
    // Attempt 4: Simpler payload format
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        webhook: {
          url: webhookUrl,
          enabled: true
        },
        events: ['all']
      }
    },
    // Attempt 5: Direct URL only
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        url: webhookUrl,
        webhook: true
      }
    }
  ];

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const url = `${baseUrl}${attempt.endpoint}`;
      console.log(`[CONFIGURE-WEBHOOK] Attempt ${i + 1} for ${instanceName}: ${attempt.method} ${url}`);
      console.log(`[CONFIGURE-WEBHOOK] Payload:`, JSON.stringify(attempt.payload));
      
      const response = await fetch(url, {
        method: attempt.method,
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify(attempt.payload),
      });

      const responseText = await response.text();
      console.log(`[CONFIGURE-WEBHOOK] Response: ${response.status} - ${responseText}`);
      
      if (response.ok) {
        console.log(`[CONFIGURE-WEBHOOK] Success with attempt ${i + 1}`);
        return true;
      }
      
      // Try to parse error for better logging
      try {
        const errorJson = JSON.parse(responseText);
        console.log(`[CONFIGURE-WEBHOOK] Error details:`, errorJson);
      } catch {
        // Not JSON, already logged raw text
      }
    } catch (error) {
      console.error(`[CONFIGURE-WEBHOOK] Attempt ${i + 1} error:`, error);
    }
  }

  console.error(`[CONFIGURE-WEBHOOK] All ${attempts.length} attempts failed for ${instanceName}`);
  return false;
};

// Restart instance to ensure webhook is active
const restartInstance = async (baseUrl: string, apiKey: string, instanceName: string): Promise<boolean> => {
  try {
    const url = `${baseUrl}/instance/restart/${instanceName}`;
    console.log(`[RESTART-INSTANCE] Restarting ${instanceName}: ${url}`);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
    });

    const responseText = await response.text();
    console.log(`[RESTART-INSTANCE] Response: ${response.status} - ${responseText}`);
    
    return response.ok;
  } catch (error) {
    console.error(`[RESTART-INSTANCE] Error:`, error);
    return false;
  }
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

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get request body (optional instance filter)
    let targetInstanceId: string | null = null;
    try {
      const body = await req.json();
      targetInstanceId = body?.instanceId || null;
    } catch {
      // No body or invalid JSON - process all instances
    }

    // Fetch connected instances for this user
    let query = supabaseClient
      .from('maturador_instances')
      .select('id, instance_name, status, user_id')
      .eq('user_id', user.id)
      .in('status', ['open', 'connected', 'connecting']);

    if (targetInstanceId) {
      query = query.eq('id', targetInstanceId);
    }

    const { data: instances, error: instancesError } = await query;

    if (instancesError) {
      console.error('[FORCE-RECONFIGURE] Error fetching instances:', instancesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch instances' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!instances || instances.length === 0) {
      console.log('[FORCE-RECONFIGURE] No connected instances found for user:', user.id);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No connected instances found',
        results: [] 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FORCE-RECONFIGURE] Processing ${instances.length} instances for user ${user.id}`);

    const results = [];

    for (const instance of instances) {
      const instanceResult: {
        instanceId: string;
        instanceName: string;
        success: boolean;
        steps: { configFound: boolean; deleted: boolean; configured: boolean; restarted: boolean };
        configSource: string;
        error: string | null;
      } = {
        instanceId: instance.id,
        instanceName: instance.instance_name,
        success: false,
        steps: {
          configFound: false,
          deleted: false,
          configured: false,
          restarted: false
        },
        configSource: '',
        error: null
      };

      try {
        // Get Evolution config for this instance
        const config = await getEvolutionConfig(supabaseClient, instance.id, instance.user_id);
        
        if (!config) {
          instanceResult.error = 'No Evolution API config found';
          results.push(instanceResult);
          console.log(`[FORCE-RECONFIGURE] No config for ${instance.instance_name}`);
          continue;
        }

        instanceResult.steps.configFound = true;
        instanceResult.configSource = config.source;

        // Step 1: Delete existing webhook
        const deleted = await deleteWebhook(config.baseUrl, config.apiKey, instance.instance_name);
        instanceResult.steps.deleted = deleted;

        // Step 2: Configure new webhook
        const configured = await configureWebhook(config.baseUrl, config.apiKey, instance.instance_name);
        instanceResult.steps.configured = configured;

        // Step 3: Restart instance (optional, helps ensure webhook is active)
        if (configured) {
          // Wait a bit before restart
          await new Promise(resolve => setTimeout(resolve, 500));
          const restarted = await restartInstance(config.baseUrl, config.apiKey, instance.instance_name);
          instanceResult.steps.restarted = restarted;
        }

        instanceResult.success = configured;

        // Log diagnostic event
        await supabaseClient.from('webhook_diagnostics').insert({
          instance_id: instance.id,
          instance_name: instance.instance_name,
          event_type: 'force_reconfigure',
          user_id: user.id,
          payload_preview: JSON.stringify({
            configSource: config.source,
            steps: instanceResult.steps
          })
        });

      } catch (error) {
        console.error(`[FORCE-RECONFIGURE] Error processing ${instance.instance_name}:`, error);
        instanceResult.error = error instanceof Error ? error.message : 'Unknown error';
      }

      results.push(instanceResult);
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[FORCE-RECONFIGURE] Completed: ${successCount}/${results.length} successful`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Reconfigured ${successCount} of ${results.length} instances`,
      results 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FORCE-RECONFIGURE] Critical error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
