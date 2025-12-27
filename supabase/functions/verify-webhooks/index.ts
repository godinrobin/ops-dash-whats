import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[VERIFY-WEBHOOKS] Starting webhook verification for user ${user.id}`);

    // Get user's Evolution API config
    const { data: config, error: configError } = await supabaseClient
      .from('maturador_config')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (configError || !config) {
      console.log('[VERIFY-WEBHOOKS] No Evolution API config found for user');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No Evolution API config found',
        configured: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const EVOLUTION_BASE_URL = config.evolution_base_url.replace(/\/$/, '');
    const EVOLUTION_API_KEY = config.evolution_api_key;

    // Get all connected instances for this user
    const { data: instances, error: instancesError } = await supabaseClient
      .from('maturador_instances')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'connected');

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

    console.log(`[VERIFY-WEBHOOKS] Found ${instances.length} connected instances`);

    const expectedWebhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-inbox-messages`;
    const results: Array<{instance: string, status: string, configured: boolean}> = [];

    for (const instance of instances) {
      const instanceName = instance.instance_name;
      console.log(`[VERIFY-WEBHOOKS] Checking webhook for ${instanceName}`);

      try {
        // Check current webhook configuration
        const findRes = await fetch(`${EVOLUTION_BASE_URL}/webhook/find/${instanceName}`, {
          method: 'GET',
          headers: {
            apikey: EVOLUTION_API_KEY,
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
            results.push({ instance: instanceName, status: 'already_configured', configured: true });
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
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "MESSAGES_DELETE",
                "CONNECTION_UPDATE",
                "SEND_MESSAGE"
              ]
            },
            // Alternative format
            {
              webhook: {
                url: expectedWebhookUrl,
                enabled: true,
                webhookByEvents: false,
                events: ["messages.upsert", "messages.update", "connection.update", "send.message"]
              }
            },
            // Simple format
            {
              url: expectedWebhookUrl,
              enabled: true,
              events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE"]
            }
          ];

          let configured = false;
          for (const payload of payloads) {
            try {
              const setRes = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: {
                  apikey: EVOLUTION_API_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
              });

              if (setRes.ok) {
                const result = await setRes.json();
                console.log(`[VERIFY-WEBHOOKS] Webhook configured successfully for ${instanceName}:`, JSON.stringify(result));
                results.push({ instance: instanceName, status: 'configured', configured: true });
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
            results.push({ instance: instanceName, status: 'failed', configured: false });
          }
        }
      } catch (instanceError) {
        console.error(`[VERIFY-WEBHOOKS] Error processing ${instanceName}:`, instanceError);
        results.push({ instance: instanceName, status: 'error', configured: false });
      }
    }

    const configuredCount = results.filter(r => r.configured).length;
    console.log(`[VERIFY-WEBHOOKS] Completed. Configured ${configuredCount}/${instances.length} webhooks`);

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      configured: configuredCount,
      total: instances.length
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
