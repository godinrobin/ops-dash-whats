import { supabase } from "@/integrations/supabase/client";

interface PushEventParams {
  userId: string;
  eventType: string;
  title: { pt: string; en: string };
  content: { pt: string; en: string };
  data?: Record<string, any>;
  iconUrl?: string;
}

/**
 * Sends a push notification event to the user's configured webhook
 * The webhook (usually Laravel) will then send the notification via OneSignal
 */
export async function sendPushEvent(params: PushEventParams) {
  const { data, error } = await supabase.functions.invoke('send-push-event', {
    body: {
      user_id: params.userId,
      event_type: params.eventType,
      title: params.title,
      content: params.content,
      data: params.data,
      icon_url: params.iconUrl
    }
  });
  
  if (error) throw error;
  return data;
}

/**
 * Tests the push notification configuration by sending a test notification
 */
export async function testPushNotification() {
  const { data, error } = await supabase.functions.invoke('test-push-event');
  
  if (error) throw error;
  return data;
}