-- Add flow_paused field to inbox_contacts
ALTER TABLE public.inbox_contacts ADD COLUMN IF NOT EXISTS flow_paused boolean DEFAULT false;