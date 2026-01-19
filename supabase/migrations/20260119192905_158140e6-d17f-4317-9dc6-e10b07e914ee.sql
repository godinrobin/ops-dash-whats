-- Add column for custom event value in automatic FB events
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS fb_event_value numeric;