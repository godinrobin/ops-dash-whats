import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// Helper to get Evolution API config with fallback strategy
// PRIORITY: 1) Instance config, 2) User config, 3) Admin config, 4) Global secrets
async function getEvolutionConfig(
  supabaseClient: any, 
  userId: string, 
  instanceConfig?: { evolution_base_url?: string; evolution_api_key?: string }
): Promise<{ baseUrl: string; apiKey: string; source: string } | null> {
  
  // 1) Try instance's own config (highest priority)
  if (instanceConfig?.evolution_base_url && instanceConfig?.evolution_api_key) {
    console.log('[CONFIGURE-WEBHOOK] Using instance config');
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
    console.log('[CONFIGURE-WEBHOOK] Using user config');
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
    console.log('[CONFIGURE-WEBHOOK] Using admin config (fallback)');
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
    console.log('[CONFIGURE-WEBHOOK] Using global secrets (fallback)');
    return {
      baseUrl: globalBaseUrl.replace(/\/$/, ''),
      apiKey: globalApiKey,
      source: 'global'
    };
  }

  return null;
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

    // Get the authenticated user from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { instanceId } = await req.json();
    console.log(`[CONFIGURE-WEBHOOK] Configuring webhook for instance: ${instanceId}, user: ${user.id}`);

    // Get instance info INCLUDING evolution config columns and UazAPI token
    const { data: instance, error: instanceError } = await supabaseClient
      .from('maturador_instances')
      .select('*, evolution_base_url, evolution_api_key, api_provider, uazapi_token')
      .eq('id', instanceId)
      .eq('user_id', user.id)
      .single();

    if (instanceError || !instance) {
      console.error('[CONFIGURE-WEBHOOK] Instance not found:', instanceError);
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceName = instance.instance_name;
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-inbox-messages`;
    
    console.log(`[CONFIGURE-WEBHOOK] Configuring webhook for ${instanceName} to ${webhookUrl}`);
    console.log(`[CONFIGURE-WEBHOOK] API Provider: ${instance.api_provider || 'evolution'}`);

    // Handle UazAPI instances differently
    if (instance.api_provider === 'uazapi') {
      // UazAPI: POST /webhook with instance token header
      if (!instance.uazapi_token) {
        return new Response(JSON.stringify({ error: 'Instance token not found (uazapi_token)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch UazAPI base URL from backend config (fallback to default)
      const { data: globalCfg } = await supabaseClient
        .from('whatsapp_api_config')
        .select('uazapi_base_url, uazapi_api_prefix')
        .limit(1)
        .maybeSingle();

      const baseUrl = (globalCfg?.uazapi_base_url || 'https://zapdata.uazapi.com').replace(/\/$/, '');
      const prefix = (globalCfg?.uazapi_api_prefix || '').toString();
      const uazapiUrl = `${baseUrl}${prefix}`;

      const instanceToken = instance.uazapi_token;

      // UazAPI v2 webhook format - POST /webhook
      // According to OpenAPI docs: events is an array, excludeMessages is also array
      // Include ALL relevant events: messages, messages_update, chats, connection
      const uazapiWebhookPayload = {
        enabled: true,
        url: webhookUrl,
        events: ['messages', 'messages_update', 'chats', 'connection', 'contacts'],
        excludeMessages: ['wasSentByApi', 'isGroupYes'],
        addUrlEvents: true,  // Adds event type to URL path for easier routing
        addUrlTypesMessages: true,  // Adds message type to URL path
      };

      console.log('[CONFIGURE-WEBHOOK] UazAPI webhook payload:', JSON.stringify(uazapiWebhookPayload));
      console.log('[CONFIGURE-WEBHOOK] UazAPI base URL:', uazapiUrl);
      console.log('[CONFIGURE-WEBHOOK] Using endpoint: POST /webhook');

      const webhookRes = await fetch(`${uazapiUrl}/webhook`, {
        method: 'POST',
        headers: {
          'token': instanceToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(uazapiWebhookPayload),
      });

      const responseText = await webhookRes.text();
      console.log('[CONFIGURE-WEBHOOK] UazAPI response:', webhookRes.status, responseText);

      if (webhookRes.ok) {
        let parsed;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = { raw: responseText };
        }

        return new Response(
          JSON.stringify({
            success: true,
            webhookUrl,
            instanceName,
            result: parsed,
            format: 'uazapi',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'Failed to configure UazAPI webhook',
          details: responseText,
          webhookUrl,
          baseUrl: uazapiUrl,
          endpoint: '/webhook',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Evolution API flow
    const evolutionConfig = await getEvolutionConfig(supabaseClient, user.id, {
      evolution_base_url: instance.evolution_base_url,
      evolution_api_key: instance.evolution_api_key,
    });

    if (!evolutionConfig) {
      console.error('[CONFIGURE-WEBHOOK] No Evolution API configuration available');
      return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[CONFIGURE-WEBHOOK] Using config source: ${evolutionConfig.source}, baseUrl: ${evolutionConfig.baseUrl}`);

    const EVOLUTION_BASE_URL = evolutionConfig.baseUrl;
    const EVOLUTION_API_KEY = evolutionConfig.apiKey;

    // Evolution API v2 format - POST /webhook/set/{instanceName}
    // The body needs the 'webhook' property with the configuration
    const webhookBody = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE', 
          'SEND_MESSAGE',
          'CONNECTION_UPDATE'
        ],
      }
    };

    console.log('[CONFIGURE-WEBHOOK] Webhook body:', JSON.stringify(webhookBody, null, 2));

    const webhookResponse = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookBody),
    });

    const responseText = await webhookResponse.text();
    console.log('[CONFIGURE-WEBHOOK] Webhook response status:', webhookResponse.status);
    console.log('[CONFIGURE-WEBHOOK] Webhook response:', responseText);

    if (!webhookResponse.ok) {
      // Try alternative format without nested webhook property (older versions)
      console.log('[CONFIGURE-WEBHOOK] First format failed, trying alternative format...');
      
      const altBody = {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE', 
          'CONNECTION_UPDATE'
        ],
      };

      const altResponse = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(altBody),
      });

      const altText = await altResponse.text();
      console.log('[CONFIGURE-WEBHOOK] Alternative response status:', altResponse.status);
      console.log('[CONFIGURE-WEBHOOK] Alternative response:', altText);

      if (!altResponse.ok) {
        // Try third format - Evolution API v1 style
        console.log('[CONFIGURE-WEBHOOK] Second format failed, trying v1 format...');
        
        const v1Body = {
          url: webhookUrl,
          enabled: true,
          events: ['all'],
        };

        const v1Response = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instanceName}`, {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(v1Body),
        });

        const v1Text = await v1Response.text();
        console.log('[CONFIGURE-WEBHOOK] V1 response status:', v1Response.status);
        console.log('[CONFIGURE-WEBHOOK] V1 response:', v1Text);

        if (!v1Response.ok) {
          return new Response(JSON.stringify({ 
            error: 'Failed to configure webhook - check Evolution API version',
            details: responseText,
            altDetails: altText,
            v1Details: v1Text,
            webhookUrl,
            configSource: evolutionConfig.source,
            evolutionBaseUrl: evolutionConfig.baseUrl,
            tip: 'You may need to configure the webhook manually in your Evolution API dashboard'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        let v1Result;
        try {
          v1Result = JSON.parse(v1Text);
        } catch {
          v1Result = { raw: v1Text };
        }

        return new Response(JSON.stringify({ 
          success: true, 
          webhookUrl,
          instanceName,
          result: v1Result,
          format: 'v1',
          configSource: evolutionConfig.source,
          evolutionBaseUrl: evolutionConfig.baseUrl
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let altResult;
      try {
        altResult = JSON.parse(altText);
      } catch {
        altResult = { raw: altText };
      }

      return new Response(JSON.stringify({ 
        success: true, 
        webhookUrl,
        instanceName,
        result: altResult,
        format: 'alternative',
        configSource: evolutionConfig.source,
        evolutionBaseUrl: evolutionConfig.baseUrl
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    console.log('[CONFIGURE-WEBHOOK] Webhook configured successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      webhookUrl,
      instanceName,
      result,
      format: 'v2',
      configSource: evolutionConfig.source,
      evolutionBaseUrl: evolutionConfig.baseUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('[CONFIGURE-WEBHOOK] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
