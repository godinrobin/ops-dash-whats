import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushEventPayload {
  user_id: string;
  event_type: string;
  title: { pt: string; en: string };
  content: { pt: string; en: string };
  data?: Record<string, any>;
  icon_url?: string;
}

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
      console.error('[send-push-event] OneSignal credentials not configured');
      return new Response(
        JSON.stringify({ error: 'OneSignal credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    const payload: PushEventPayload = await req.json();
    const { user_id, event_type, title, content, data, icon_url } = payload;

    console.log(`[send-push-event] Processing event "${event_type}" for user ${user_id}`);

    if (!user_id || !event_type || !title || !content) {
      console.error('[send-push-event] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, event_type, title, content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user's push settings
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_webhook_enabled, push_subscription_ids')
      .eq('id', user_id)
      .single();

    if (profileError) {
      console.error('[send-push-event] Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'User not found', details: profileError.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if push is enabled
    if (!profile.push_webhook_enabled) {
      console.log('[send-push-event] Push notifications disabled for user');
      return new Response(
        JSON.stringify({ success: false, reason: 'Push notifications disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if there are subscription IDs
    const subscriptionIds = profile.push_subscription_ids || [];
    if (subscriptionIds.length === 0) {
      console.log('[send-push-event] No subscription IDs registered');
      return new Response(
        JSON.stringify({ success: false, reason: 'No subscription IDs registered' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build OneSignal payload
    const onesignalPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_subscription_ids: subscriptionIds,
      headings: title,
      contents: content,
      chrome_web_icon: icon_url || 'https://zapdata.com.br/favicon.png',
      firefox_icon: icon_url || 'https://zapdata.com.br/favicon.png',
      data: {
        ...data,
        event_type,
        timestamp: new Date().toISOString(),
      },
    };

    console.log(`[send-push-event] Sending to OneSignal API with ${subscriptionIds.length} subscription(s)`);

    // Send directly to OneSignal
    const onesignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(onesignalPayload),
    });

    const responseData = await onesignalResponse.json();
    console.log(`[send-push-event] OneSignal response: ${onesignalResponse.status}`, responseData);

    if (!onesignalResponse.ok) {
      console.error(`[send-push-event] OneSignal API failed with status ${onesignalResponse.status}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          reason: 'OneSignal API request failed',
          status: onesignalResponse.status,
          response: responseData 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[send-push-event] Push event sent successfully');
    return new Response(
      JSON.stringify({ 
        success: true, 
        onesignal_id: responseData.id,
        recipients: responseData.recipients,
        subscription_count: subscriptionIds.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[send-push-event] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
