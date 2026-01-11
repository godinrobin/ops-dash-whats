-- Add priority column to push notification queue
ALTER TABLE public.push_notification_queue
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;

-- Comment for documentation
COMMENT ON COLUMN public.push_notification_queue.priority IS 'Notification priority: 10 = highest urgency (instance disconnect), 5 = normal';

-- Update the trigger function to pass the phone number correctly and set high priority
CREATE OR REPLACE FUNCTION public.notify_instance_disconnect()
RETURNS TRIGGER AS $$
DECLARE
  user_profile RECORD;
  instance_identifier TEXT;
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
      
      -- Get phone number - prioritize phone_number, then fallback to instance_name
      instance_identifier := COALESCE(
        NULLIF(NEW.phone_number, ''),
        NULLIF(NEW.label, ''),
        NEW.instance_name
      );
      
      -- Log for debugging
      RAISE NOTICE 'Instance disconnect notification: phone=%, label=%, name=%, chosen=%', 
        NEW.phone_number, NEW.label, NEW.instance_name, instance_identifier;
      
      -- Insert into notification queue with HIGH PRIORITY (10)
      INSERT INTO public.push_notification_queue (
        user_id,
        subscription_ids,
        title,
        message,
        icon_url,
        priority
      ) VALUES (
        NEW.user_id,
        user_profile.push_subscription_ids,
        '🚨 Instância Caiu!',
        'Instância: ' || instance_identifier || ' desconectou!',
        'https://zapdata.com.br/favicon.png',
        10  -- Highest priority
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;