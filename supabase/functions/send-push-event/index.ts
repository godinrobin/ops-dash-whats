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
      .select('push_webhook_url, push_webhook_enabled, push_subscription_ids')
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

    // Check if webhook URL is configured
    if (!profile.push_webhook_url) {
      console.log('[send-push-event] No webhook URL configured');
      return new Response(
        JSON.stringify({ success: false, reason: 'No webhook URL configured' }),
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

    // Build webhook payload (same format expected by Laravel NotificationTrait)
    const webhookPayload = {
      subscription_ids: subscriptionIds,
      event_type,
      title,
      content,
      icon_url: icon_url || 'https://zapdata.com.br/favicon.png',
      data: data || {},
    };

    console.log(`[send-push-event] Sending to webhook: ${profile.push_webhook_url}`);
    console.log(`[send-push-event] Payload:`, JSON.stringify(webhookPayload));

    // Send to Laravel webhook
    const webhookResponse = await fetch(profile.push_webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zapdata-Event': event_type,
        'X-Zapdata-Timestamp': new Date().toISOString(),
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await webhookResponse.text();
    console.log(`[send-push-event] Webhook response: ${webhookResponse.status} - ${responseText}`);

    if (!webhookResponse.ok) {
      console.error(`[send-push-event] Webhook failed with status ${webhookResponse.status}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          reason: 'Webhook request failed',
          status: webhookResponse.status,
          response: responseText 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[send-push-event] Push event sent successfully');
    return new Response(
      JSON.stringify({ 
        success: true, 
        webhook_status: webhookResponse.status,
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