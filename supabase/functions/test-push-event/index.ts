import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the user from the token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('[test-push-event] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[test-push-event] Testing push for user ${user.id}`);

    // Fetch user's push settings
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_webhook_url, push_webhook_enabled, push_subscription_ids')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[test-push-event] Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Profile not found', details: profileError.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate settings
    if (!profile.push_webhook_enabled) {
      return new Response(
        JSON.stringify({ success: false, reason: 'Push notifications are disabled. Enable them first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile.push_webhook_url) {
      return new Response(
        JSON.stringify({ success: false, reason: 'No webhook URL configured. Add your Laravel webhook URL.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const subscriptionIds = profile.push_subscription_ids || [];
    if (subscriptionIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, reason: 'No subscription IDs registered. Add at least one device token.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build test payload
    const testPayload = {
      subscription_ids: subscriptionIds,
      event_type: 'test',
      title: { pt: '🔔 Teste Zapdata', en: '🔔 Zapdata Test' },
      content: { pt: 'Suas notificações push estão funcionando!', en: 'Your push notifications are working!' },
      icon_url: 'https://zapdata.com.br/favicon.png',
      data: { test: true, timestamp: new Date().toISOString() },
    };

    console.log(`[test-push-event] Sending test to webhook: ${profile.push_webhook_url}`);

    const startTime = Date.now();
    
    // Send to Laravel webhook
    const webhookResponse = await fetch(profile.push_webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zapdata-Event': 'test',
        'X-Zapdata-Timestamp': new Date().toISOString(),
      },
      body: JSON.stringify(testPayload),
    });

    const responseTime = Date.now() - startTime;
    const responseText = await webhookResponse.text();
    
    console.log(`[test-push-event] Webhook response: ${webhookResponse.status} in ${responseTime}ms`);

    if (!webhookResponse.ok) {
      console.error(`[test-push-event] Webhook failed:`, responseText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          reason: `Webhook returned error ${webhookResponse.status}`,
          response: responseText,
          response_time_ms: responseTime
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[test-push-event] Test sent successfully');
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notificação de teste enviada com sucesso!',
        webhook_status: webhookResponse.status,
        response_time_ms: responseTime,
        devices_notified: subscriptionIds.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[test-push-event] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});