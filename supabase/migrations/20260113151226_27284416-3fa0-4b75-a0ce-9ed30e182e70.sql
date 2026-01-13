-- ============================================
-- FIX 1: Create table for comment replies and reactions
-- ============================================

-- Table for comment replies (nested comments)
CREATE TABLE IF NOT EXISTS public.feed_comment_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.feed_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for comment reactions
CREATE TABLE IF NOT EXISTS public.feed_comment_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.feed_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reaction TEXT NOT NULL DEFAULT '🔥',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS
ALTER TABLE public.feed_comment_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_comment_reactions ENABLE ROW LEVEL SECURITY;

-- RLS for comment replies
CREATE POLICY "Full members can view comment replies" 
ON public.feed_comment_replies 
FOR SELECT 
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_full_member = true));

CREATE POLICY "Users can create comment replies" 
ON public.feed_comment_replies 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comment replies" 
ON public.feed_comment_replies 
FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any comment reply" 
ON public.feed_comment_replies 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS for comment reactions
CREATE POLICY "Full members can view comment reactions" 
ON public.feed_comment_reactions 
FOR SELECT 
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_full_member = true));

CREATE POLICY "Users can manage own comment reactions" 
ON public.feed_comment_reactions 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- FIX 2: Update the disconnect notification trigger
-- Only trigger when going FROM connected TO truly disconnected (not connecting)
-- Also add connected notification
-- ============================================

CREATE OR REPLACE FUNCTION public.notify_instance_disconnect()
RETURNS TRIGGER AS $$
DECLARE
  user_profile RECORD;
  instance_phone TEXT;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Get phone number or instance name for notification
  instance_phone := COALESCE(NEW.phone_number, NEW.instance_name);
  
  -- Case 1: Instance just got CONNECTED (from disconnected/close/connecting to connected/open)
  IF (OLD.status IN ('disconnected', 'close', 'connecting', 'waiting', 'qr') AND NEW.status IN ('connected', 'open')) THEN
    
    -- Get user profile with push settings
    SELECT push_webhook_enabled, push_subscription_ids, notify_on_disconnect
    INTO user_profile
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Check if user wants notifications AND has push enabled
    IF user_profile.push_webhook_enabled = true 
       AND user_profile.notify_on_disconnect = true 
       AND user_profile.push_subscription_ids IS NOT NULL 
       AND array_length(user_profile.push_subscription_ids, 1) > 0 THEN
      
      -- Insert CONNECTED notification
      INSERT INTO public.push_notification_queue (
        user_id,
        subscription_ids,
        title,
        message,
        icon_url
      ) VALUES (
        NEW.user_id,
        user_profile.push_subscription_ids,
        '✅ Instância Conectada!',
        'Instância ' || instance_phone || ' conectou com sucesso!',
        'https://zapdata.com.br/favicon.png'
      );
    END IF;
    
  -- Case 2: Instance got DISCONNECTED (from connected/open to disconnected/close only - NOT connecting)
  ELSIF (OLD.status IN ('connected', 'open') AND NEW.status IN ('disconnected', 'close')) THEN
    
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
      
      -- Insert DISCONNECTED notification
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
        'Instância ' || instance_phone || ' desconectou!',
        'https://zapdata.com.br/favicon.png'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;