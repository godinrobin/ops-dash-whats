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

// Build headers with both apikey and Authorization
const buildHeaders = (apiKey: string) => ({
  'Content-Type': 'application/json',
  'apikey': apiKey,
  'Authorization': `Bearer ${apiKey}`,
});

interface AttemptResult {
  attemptNumber: number;
  endpoint: string;
  method: string;
  status: number;
  responseBody: string;
  success: boolean;
}

// Configure new webhook - tries multiple payload formats
const configureWebhook = async (
  baseUrl: string, 
  apiKey: string, 
  instanceName: string
): Promise<{ success: boolean; attemptResults: AttemptResult[] }> => {
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-inbox-messages`;
  const headers = buildHeaders(apiKey);
  const attemptResults: AttemptResult[] = [];
  
  // Events in different formats for compatibility
  const eventsUppercase = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'SEND_MESSAGE'];
  const eventsLowercase = ['messages.upsert', 'messages.update', 'connection.update', 'send.message'];
  
  // Different endpoint/payload combinations to try (based on observed API error patterns)
  const attempts = [
    // Attempt 1: webhook object format (for "instance requires property webhook" error)
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: {},
          byEvents: false,
          base64: false,
          events: eventsUppercase
        }
      }
    },
    // Attempt 2: instance.webhook wrapper (alternative structure)
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        instance: {
          webhook: {
            enabled: true,
            url: webhookUrl,
            headers: {},
            byEvents: false,
            base64: false,
            events: eventsUppercase
          }
        }
      }
    },
    // Attempt 3: webhookByEvents/webhookBase64 naming (some servers use this)
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: {},
          webhookByEvents: false,
          webhookBase64: false,
          events: eventsUppercase
        }
      }
    },
    // Attempt 4: Flat structure with lowercase events
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: false,
        events: eventsLowercase
      }
    },
    // Attempt 5: Flat structure with uppercase events
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: false,
        events: eventsUppercase
      }
    },
    // Attempt 6: Minimal webhook object
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        webhook: {
          url: webhookUrl,
          enabled: true
        }
      }
    },
    // Attempt 7: PUT method (some servers require PUT for update)
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'PUT',
      payload: {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: {},
          byEvents: false,
          base64: false,
          events: eventsUppercase
        }
      }
    },
    // Attempt 8: Legacy v1 endpoint style
    {
      endpoint: `/webhook/instance/${instanceName}`,
      method: 'POST',
      payload: {
        webhook: {
          url: webhookUrl,
          enabled: true,
          events: eventsLowercase
        }
      }
    },
    // Attempt 9: Just URL at root level with webhook=true flag
    {
      endpoint: `/webhook/set/${instanceName}`,
      method: 'POST',
      payload: {
        url: webhookUrl,
        webhook: true,
        events: ['all']
      }
    }
  ];

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const attemptResult: AttemptResult = {
      attemptNumber: i + 1,
      endpoint: attempt.endpoint,
      method: attempt.method,
      status: 0,
      responseBody: '',
      success: false
    };

    try {
      const url = `${baseUrl}${attempt.endpoint}`;
      console.log(`[CONFIGURE-WEBHOOK] Attempt ${i + 1}/${attempts.length} for ${instanceName}: ${attempt.method} ${url}`);
      console.log(`[CONFIGURE-WEBHOOK] Payload:`, JSON.stringify(attempt.payload));
      
      const response = await fetch(url, {
        method: attempt.method,
        headers,
        body: JSON.stringify(attempt.payload),
      });

      attemptResult.status = response.status;
      attemptResult.responseBody = await response.text();
      
      console.log(`[CONFIGURE-WEBHOOK] Response: ${response.status} - ${attemptResult.responseBody.substring(0, 500)}`);
      
      if (response.ok) {
        attemptResult.success = true;
        attemptResults.push(attemptResult);
        console.log(`[CONFIGURE-WEBHOOK] SUCCESS with attempt ${i + 1} for ${instanceName}`);
        return { success: true, attemptResults };
      }
      
    } catch (error) {
      attemptResult.responseBody = `Error: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[CONFIGURE-WEBHOOK] Attempt ${i + 1} error:`, error);
    }

    attemptResults.push(attemptResult);
  }

  console.error(`[CONFIGURE-WEBHOOK] All ${attempts.length} attempts failed for ${instanceName}`);
  return { success: false, attemptResults };
};

// Delete existing webhook configuration (optional step, only if needed)
const deleteWebhook = async (baseUrl: string, apiKey: string, instanceName: string): Promise<boolean> => {
  try {
    const url = `${baseUrl}/webhook/set/${instanceName}`;
    console.log(`[DELETE-WEBHOOK] Deleting webhook for ${instanceName}: ${url}`);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: buildHeaders(apiKey),
    });

    const responseText = await response.text();
    console.log(`[DELETE-WEBHOOK] Response: ${response.status} - ${responseText}`);
    
    return response.ok || response.status === 404; // 404 = already deleted
  } catch (error) {
    console.error(`[DELETE-WEBHOOK] Error:`, error);
    return false;
  }
};

// Restart instance to ensure webhook is active
const restartInstance = async (baseUrl: string, apiKey: string, instanceName: string): Promise<boolean> => {
  try {
    const url = `${baseUrl}/instance/restart/${instanceName}`;
    console.log(`[RESTART-INSTANCE] Restarting ${instanceName}: ${url}`);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: buildHeaders(apiKey),
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
        steps: { configFound: boolean; configured: boolean; deletedThenRetried: boolean; restarted: boolean };
        configSource: string;
        attemptDetails: AttemptResult[];
        error: string | null;
      } = {
        instanceId: instance.id,
        instanceName: instance.instance_name,
        success: false,
        steps: {
          configFound: false,
          configured: false,
          deletedThenRetried: false,
          restarted: false
        },
        configSource: '',
        attemptDetails: [],
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

        // Step 1: Try to configure webhook directly (avoid downtime)
        console.log(`[FORCE-RECONFIGURE] Attempting direct configuration for ${instance.instance_name}`);
        let configResult = await configureWebhook(config.baseUrl, config.apiKey, instance.instance_name);
        instanceResult.attemptDetails = configResult.attemptResults;

        if (configResult.success) {
          instanceResult.steps.configured = true;
        } else {
          // Step 2: If direct config failed, try delete + configure
          console.log(`[FORCE-RECONFIGURE] Direct config failed, trying delete + reconfigure for ${instance.instance_name}`);
          const deleted = await deleteWebhook(config.baseUrl, config.apiKey, instance.instance_name);
          
          if (deleted) {
            // Wait a bit after delete
            await new Promise(resolve => setTimeout(resolve, 300));
            
            configResult = await configureWebhook(config.baseUrl, config.apiKey, instance.instance_name);
            instanceResult.attemptDetails = [...instanceResult.attemptDetails, ...configResult.attemptResults];
            instanceResult.steps.deletedThenRetried = true;
            
            if (configResult.success) {
              instanceResult.steps.configured = true;
            }
          }
        }

        // Step 3: Restart instance if configured successfully
        if (instanceResult.steps.configured) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const restarted = await restartInstance(config.baseUrl, config.apiKey, instance.instance_name);
          instanceResult.steps.restarted = restarted;
        }

        instanceResult.success = instanceResult.steps.configured;

        // Log diagnostic event with detailed attempt info
        await supabaseClient.from('webhook_diagnostics').insert({
          instance_id: instance.id,
          instance_name: instance.instance_name,
          event_type: 'force_reconfigure',
          user_id: user.id,
          payload_preview: JSON.stringify({
            configSource: config.source,
            steps: instanceResult.steps,
            totalAttempts: instanceResult.attemptDetails.length,
            successfulAttempt: instanceResult.attemptDetails.find(a => a.success) || null,
            lastFailedAttempts: instanceResult.attemptDetails.filter(a => !a.success).slice(-3).map(a => ({
              attempt: a.attemptNumber,
              status: a.status,
              response: a.responseBody.substring(0, 200)
            }))
          }).substring(0, 2000)
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
