-- Add remote_jid column to store the correct Evolution API JID for reliable message syncing
ALTER TABLE public.inbox_contacts 
ADD COLUMN IF NOT EXISTS remote_jid TEXT;

-- Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_inbox_contacts_remote_jid ON public.inbox_contacts(remote_jid);

-- Add comment explaining the column
COMMENT ON COLUMN public.inbox_contacts.remote_jid IS 'The Evolution API remoteJid for this contact, stored for reliable message syncing';