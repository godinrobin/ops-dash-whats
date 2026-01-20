-- Add pause_other_flows column to inbox_flows table
-- This will pause all other active flow sessions for a contact when this flow triggers
ALTER TABLE public.inbox_flows 
ADD COLUMN IF NOT EXISTS pause_other_flows BOOLEAN DEFAULT false;