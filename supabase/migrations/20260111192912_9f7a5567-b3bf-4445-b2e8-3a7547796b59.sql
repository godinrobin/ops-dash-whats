-- Add column for instance disconnect notification preference
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_on_disconnect boolean DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.notify_on_disconnect IS 'Whether user wants push notifications when an instance disconnects';

-- Create a function to send push notification when instance disconnects
CREATE OR REPLACE FUNCTION public.notify_instance_disconnect()
RETURNS TRIGGER AS $$
DECLARE
  user_profile RECORD;
  subscription_id TEXT;
  instance_phone TEXT;
BEGIN
  -- Only trigger when status changes TO 'disconnected' or 'close' FROM 'connected' or 'open'
  IF (OLD.status IN ('connected', 'open') AND NEW.status IN ('disconnected', 'close', 'connecting')) THEN
    
    -- Get user profile with push settings
    SELECT push_webhook_enabled, push_subscription_ids, notify_on_disconnect
    INTO user_profile
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Check if user wants disconnect notifications
    IF user_profile.push_webhook_enabled = true 
       AND user_profile.notify_on_disconnect = true 
       AND user_profile.push_subscription_ids IS NOT NULL 
       AND array_length(user_profile.push_subscription_ids, 1) > 0 THEN
      
      -- Get phone number or instance name for notification
      instance_phone := COALESCE(NEW.phone_number, NEW.instance_name);
      
      -- Insert into a notification queue table to be processed by edge function
      INSERT INTO public.push_notification_queue (
        user_id,
        subscription_ids,
        title,
        message,
        icon_url
      ) VALUES (
        NEW.user_id,
        user_profile.push_subscription_ids,
        '🚨 Instância Caiu!',
        'Instância: ' || instance_phone || ' desconectou!',
        'https://zapdata.com.br/favicon.png'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create notification queue table
CREATE TABLE IF NOT EXISTS public.push_notification_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subscription_ids TEXT[] NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  icon_url TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own notifications" 
ON public.push_notification_queue 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications" 
ON public.push_notification_queue 
FOR INSERT 
WITH CHECK (true);

-- Create trigger on maturador_instances
DROP TRIGGER IF EXISTS trigger_notify_instance_disconnect ON public.maturador_instances;
CREATE TRIGGER trigger_notify_instance_disconnect
AFTER UPDATE ON public.maturador_instances
FOR EACH ROW
EXECUTE FUNCTION public.notify_instance_disconnect();

-- Enable realtime for the queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.push_notification_queue;