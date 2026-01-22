import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// Helper to get Evolution API config with fallback strategy
// PRIORITY: 1) Instance config, 2) User config, 3) Admin config, 4) Global secrets
async function getEvolutionConfigForInstance(
  supabaseClient: any, 
  userId: string, 
  instanceConfig?: { evolution_base_url?: string; evolution_api_key?: string }
): Promise<{ baseUrl: string; apiKey: string; source: string } | null> {
  
  // 1) Try instance's own config (highest priority)
  if (instanceConfig?.evolution_base_url && instanceConfig?.evolution_api_key) {
    return {
      baseUrl: instanceConfig.evolution_base_url.replace(/\/$/, ''),
      apiKey: instanceConfig.evolution_api_key,
      source: 'instance'
    };
  }

  // 2) Try user's own config
  const { data: userConfig } = await supabaseClient
    .from('maturador_config')
    .select('evolution_base_url, evolution_api_key')
    .eq('user_id', userId)
    .maybeSingle();

  if (userConfig?.evolution_base_url && userConfig?.evolution_api_key) {
    return {
      baseUrl: userConfig.evolution_base_url.replace(/\/$/, ''),
      apiKey: userConfig.evolution_api_key,
      source: 'user'
    };
  }

  // 3) Try any admin config (first available)
  const { data: adminConfig } = await supabaseClient
    .from('maturador_config')
    .select('evolution_base_url, evolution_api_key')
    .limit(1)
    .maybeSingle();

  if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
    return {
      baseUrl: adminConfig.evolution_base_url.replace(/\/$/, ''),
      apiKey: adminConfig.evolution_api_key,
      source: 'admin'
    };
  }

  // 4) Try global secrets
  const globalBaseUrl = Deno.env.get('EVOLUTION_BASE_URL');
  const globalApiKey = Deno.env.get('EVOLUTION_API_KEY');

  if (globalBaseUrl && globalApiKey) {
    return {
      baseUrl: globalBaseUrl.replace(/\/$/, ''),
      apiKey: globalApiKey,
      source: 'global'
    };
  }

  return null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !data?.claims) {
      console.error('[VERIFY-WEBHOOKS] Invalid token:', claimsError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const user = { id: data.claims.sub as string };

    console.log(`[VERIFY-WEBHOOKS] Starting webhook verification for user ${user.id}`);

    // Get all connected instances for this user (include 'open' status too) WITH evolution config
    const { data: instances, error: instancesError } = await supabaseClient
      .from('maturador_instances')
      .select('*, evolution_base_url, evolution_api_key')
      .eq('user_id', user.id)
      .in('status', ['connected', 'open']);

    if (instancesError) {
      console.error('[VERIFY-WEBHOOKS] Error fetching instances:', instancesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch instances' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!instances || instances.length === 0) {
      console.log('[VERIFY-WEBHOOKS] No connected instances found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No connected instances',
        configured: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[VERIFY-WEBHOOKS] Found ${instances.length} connected/open instances`);

    const expectedWebhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-inbox-messages`;

    // UazAPI base URL from backend config (fallback to default)
    const { data: uazapiCfg } = await supabaseClient
      .from('whatsapp_api_config')
      .select('uazapi_base_url, uazapi_api_prefix')
      .limit(1)
      .maybeSingle();

    const uazapiBaseUrl = (uazapiCfg?.uazapi_base_url || 'https://zapdata.uazapi.com').replace(/\/$/, '');
    const uazapiPrefix = (uazapiCfg?.uazapi_api_prefix || '').toString();
    const uazapiUrl = `${uazapiBaseUrl}${uazapiPrefix}`;

    const results: Array<{
      instance: string;
      status: string;
      configured: boolean;
      provider: 'uazapi' | 'evolution';
      configSource?: string;
      providerUrl?: string;
      details?: string;
    }> = [];

    for (const instance of instances) {
      const instanceName = instance.instance_name;
      const provider: 'uazapi' | 'evolution' = instance.api_provider === 'uazapi' ? 'uazapi' : 'evolution';

      // UazAPI instances are handled by configure-webhook (setWebhooks). Here we just report.
      if (provider === 'uazapi') {
        results.push({
          instance: instanceName,
          status: 'uazapi_instance',
          configured: true,
          provider: 'uazapi',
          configSource: 'instance',
          providerUrl: uazapiUrl,
          details: 'UazAPI webhooks are configured via /instance/setWebhooks (use configure-webhook/auto-heal).',
        });
        continue;
      }

      // Evolution config for THIS specific instance (may have its own server)
      const evolutionConfig = await getEvolutionConfigForInstance(supabaseClient, user.id, {
        evolution_base_url: instance.evolution_base_url,
        evolution_api_key: instance.evolution_api_key,
      });

      if (!evolutionConfig) {
        console.log(`[VERIFY-WEBHOOKS] No Evolution config available for ${instanceName}`);
        results.push({
          instance: instanceName,
          status: 'no_config',
          configured: false,
          provider: 'evolution',
          configSource: 'none',
        });
        continue;
      }

      console.log(`[VERIFY-WEBHOOKS] Checking webhook for ${instanceName} using ${evolutionConfig.source} config (${evolutionConfig.baseUrl})`);

      try {
        // Check current webhook configuration
        const findRes = await fetch(`${evolutionConfig.baseUrl}/webhook/find/${instanceName}`, {
          method: 'GET',
          headers: {
            apikey: evolutionConfig.apiKey,
            'Content-Type': 'application/json',
          },
        });

        let needsConfiguration = true;

        if (findRes.ok) {
          const webhookData = await findRes.json();
          console.log(`[VERIFY-WEBHOOKS] Current webhook for ${instanceName}:`, JSON.stringify(webhookData));

          // Check if webhook is properly configured
          const currentUrl = webhookData?.url || webhookData?.webhook?.url || '';
          const isEnabled = webhookData?.enabled ?? webhookData?.webhook?.enabled ?? false;

          if (currentUrl === expectedWebhookUrl && isEnabled) {
            console.log(`[VERIFY-WEBHOOKS] Webhook already configured correctly for ${instanceName}`);
            results.push({
              instance: instanceName,
              status: 'already_configured',
              configured: true,
              provider: 'evolution',
              configSource: evolutionConfig.source,
              providerUrl: evolutionConfig.baseUrl,
            });
            needsConfiguration = false;
          }
        }

        if (needsConfiguration) {
          console.log(`[VERIFY-WEBHOOKS] Configuring webhook for ${instanceName}`);

          // Try different payload formats for different Evolution API versions
          const payloads = [
            // Evolution API v2 format
            {
              url: expectedWebhookUrl,
              enabled: true,
              webhookByEvents: false,
              webhookBase64: false,
              events: [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'MESSAGES_DELETE',
                'CONNECTION_UPDATE',
                'SEND_MESSAGE',
              ],
            },
            // Alternative format
            {
              webhook: {
                url: expectedWebhookUrl,
                enabled: true,
                webhookByEvents: false,
                events: ['messages.upsert', 'messages.update', 'connection.update', 'send.message'],
              },
            },
            // Simple format
            {
              url: expectedWebhookUrl,
              enabled: true,
              events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'SEND_MESSAGE'],
            },
          ];

          let configured = false;
          for (const payload of payloads) {
            try {
              const setRes = await fetch(`${evolutionConfig.baseUrl}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: {
                  apikey: evolutionConfig.apiKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
              });

              if (setRes.ok) {
                const result = await setRes.json();
                console.log(`[VERIFY-WEBHOOKS] Webhook configured successfully for ${instanceName}:`, JSON.stringify(result));
                results.push({
                  instance: instanceName,
                  status: 'configured',
                  configured: true,
                  provider: 'evolution',
                  configSource: evolutionConfig.source,
                  providerUrl: evolutionConfig.baseUrl,
                });
                configured = true;
                break;
              } else {
                const errorText = await setRes.text();
                console.log(`[VERIFY-WEBHOOKS] Payload failed for ${instanceName}:`, errorText);
              }
            } catch (payloadError) {
              console.log(`[VERIFY-WEBHOOKS] Payload error for ${instanceName}:`, payloadError);
            }
          }

          if (!configured) {
            console.error(`[VERIFY-WEBHOOKS] Failed to configure webhook for ${instanceName}`);
            results.push({
              instance: instanceName,
              status: 'failed',
              configured: false,
              provider: 'evolution',
              configSource: evolutionConfig.source,
              providerUrl: evolutionConfig.baseUrl,
            });
          }
        }
      } catch (instanceError) {
        console.error(`[VERIFY-WEBHOOKS] Error processing ${instanceName}:`, instanceError);
        results.push({
          instance: instanceName,
          status: 'error',
          configured: false,
          provider: 'evolution',
          configSource: evolutionConfig.source,
          providerUrl: evolutionConfig.baseUrl,
        });
      }
    }

    const configuredCount = results.filter(r => r.configured).length;
    console.log(`[VERIFY-WEBHOOKS] Completed. Configured ${configuredCount}/${instances.length} webhooks`);

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      configured: configuredCount,
      total: instances.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('[VERIFY-WEBHOOKS] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
