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

    // Get OneSignal credentials
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error('[test-push-event] OneSignal credentials not configured');
      return new Response(
        JSON.stringify({ error: 'OneSignal credentials not configured. Add ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      .select('push_webhook_enabled, push_subscription_ids')
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
        JSON.stringify({ success: false, reason: 'Notificações push desativadas. Ative-as primeiro.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const subscriptionIds = profile.push_subscription_ids || [];
    if (subscriptionIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, reason: 'Nenhum dispositivo cadastrado. Adicione pelo menos um token.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build OneSignal test payload
    const onesignalPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_subscription_ids: subscriptionIds,
      headings: { 
        pt: '🔔 Teste Zapdata', 
        en: '🔔 Zapdata Test' 
      },
      contents: { 
        pt: 'Suas notificações push estão funcionando!', 
        en: 'Your push notifications are working!' 
      },
      chrome_web_icon: 'https://zapdata.com.br/favicon.png',
      firefox_icon: 'https://zapdata.com.br/favicon.png',
      data: { 
        test: true, 
        timestamp: new Date().toISOString() 
      },
    };

    console.log(`[test-push-event] Sending test to OneSignal with ${subscriptionIds.length} subscription(s)`);

    const startTime = Date.now();
    
    // Send directly to OneSignal API
    const onesignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(onesignalPayload),
    });

    const responseTime = Date.now() - startTime;
    const responseData = await onesignalResponse.json();
    
    console.log(`[test-push-event] OneSignal response: ${onesignalResponse.status} in ${responseTime}ms`, responseData);

    if (!onesignalResponse.ok) {
      console.error(`[test-push-event] OneSignal failed:`, responseData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          reason: `OneSignal API retornou erro ${onesignalResponse.status}`,
          details: responseData.errors || responseData,
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
        onesignal_id: responseData.id,
        recipients: responseData.recipients,
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
