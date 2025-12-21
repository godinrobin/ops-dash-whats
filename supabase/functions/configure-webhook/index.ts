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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { instanceId } = await req.json();
    console.log('Configuring webhook for instance:', instanceId);

    // Get instance info
    const { data: instance, error: instanceError } = await supabaseClient
      .from('maturador_instances')
      .select('*')
      .eq('id', instanceId)
      .eq('user_id', user.id)
      .single();

    if (instanceError || !instance) {
      console.error('Instance not found:', instanceError);
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's Evolution API config
    const { data: config } = await supabaseClient
      .from('maturador_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const EVOLUTION_BASE_URL = config.evolution_base_url.replace(/\/$/, '');
    const EVOLUTION_API_KEY = config.evolution_api_key;
    const instanceName = instance.instance_name;
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    
    // Webhook URL for receiving messages
    const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-inbox-messages`;
    
    console.log(`Configuring webhook for ${instanceName} to ${webhookUrl}`);

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

    console.log('Webhook body:', JSON.stringify(webhookBody, null, 2));

    const webhookResponse = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookBody),
    });

    const responseText = await webhookResponse.text();
    console.log('Webhook response status:', webhookResponse.status);
    console.log('Webhook response:', responseText);

    if (!webhookResponse.ok) {
      // Try alternative format without nested webhook property (older versions)
      console.log('First format failed, trying alternative format...');
      
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
      console.log('Alternative response status:', altResponse.status);
      console.log('Alternative response:', altText);

      if (!altResponse.ok) {
        // Try third format - Evolution API v1 style
        console.log('Second format failed, trying v1 format...');
        
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
        console.log('V1 response status:', v1Response.status);
        console.log('V1 response:', v1Text);

        if (!v1Response.ok) {
          return new Response(JSON.stringify({ 
            error: 'Failed to configure webhook - check Evolution API version',
            details: responseText,
            altDetails: altText,
            v1Details: v1Text,
            webhookUrl,
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
          format: 'v1'
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
        format: 'alternative'
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

    console.log('Webhook configured successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      webhookUrl,
      instanceName,
      result,
      format: 'v2'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('Configure webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
