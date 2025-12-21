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

    // Configure webhook on Evolution API
    const webhookResponse = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
          'CONNECTION_UPDATE',
          'MESSAGES_SET'
        ],
      }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('Evolution API webhook error:', errorText);
      
      // Try alternative endpoint format
      const altResponse = await fetch(`${EVOLUTION_BASE_URL}/webhook/instance/${instanceName}`, {
        method: 'PUT',
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: true,
          url: webhookUrl,
          events: [
            'messages.upsert',
            'messages.update',
            'send.message',
            'connection.update'
          ],
        }),
      });

      if (!altResponse.ok) {
        const altError = await altResponse.text();
        console.error('Alternative webhook endpoint also failed:', altError);
        return new Response(JSON.stringify({ 
          error: 'Failed to configure webhook',
          details: errorText,
          altDetails: altError
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const altResult = await altResponse.json();
      console.log('Webhook configured via alternative endpoint:', altResult);
      
      return new Response(JSON.stringify({ 
        success: true, 
        webhookUrl,
        instanceName,
        result: altResult
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await webhookResponse.json();
    console.log('Webhook configured successfully:', result);

    return new Response(JSON.stringify({ 
      success: true, 
      webhookUrl,
      instanceName,
      result
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
