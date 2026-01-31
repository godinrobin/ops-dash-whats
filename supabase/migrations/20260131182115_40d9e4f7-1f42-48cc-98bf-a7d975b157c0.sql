-- Add click_url column to push_notification_queue for redirect on notification click
ALTER TABLE public.push_notification_queue 
ADD COLUMN IF NOT EXISTS click_url TEXT;