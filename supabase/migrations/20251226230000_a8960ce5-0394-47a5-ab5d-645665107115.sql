-- Add pause_on_media column to inbox_flows table
ALTER TABLE public.inbox_flows 
ADD COLUMN IF NOT EXISTS pause_on_media boolean DEFAULT false;