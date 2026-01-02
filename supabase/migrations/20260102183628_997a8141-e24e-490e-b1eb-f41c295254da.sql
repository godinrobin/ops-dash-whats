-- Drop old index if it exists (may already exist from previous attempt)
DROP INDEX IF EXISTS public.idx_inbox_messages_unique_remote_id;
DROP INDEX IF EXISTS public.inbox_messages_contact_remote_message_id_uniq;

-- Create unique index to prevent future duplicates (partial index for non-null remote_message_id)
CREATE UNIQUE INDEX inbox_messages_contact_remote_message_id_uniq
ON public.inbox_messages (contact_id, remote_message_id)
WHERE remote_message_id IS NOT NULL;