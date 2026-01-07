-- Add is_ignored column to inbox_contacts for filtering ignored contacts
ALTER TABLE public.inbox_contacts 
ADD COLUMN IF NOT EXISTS is_ignored boolean DEFAULT false;

-- Create index for better filtering performance
CREATE INDEX IF NOT EXISTS idx_inbox_contacts_is_ignored ON public.inbox_contacts(is_ignored) WHERE is_ignored = true;