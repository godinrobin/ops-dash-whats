-- Add reply_to_last_message column to inbox_flows table
ALTER TABLE public.inbox_flows 
ADD COLUMN IF NOT EXISTS reply_to_last_message boolean DEFAULT false;