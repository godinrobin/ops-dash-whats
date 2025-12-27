-- Add last_error_at column to track recent connection errors
ALTER TABLE public.maturador_instances 
ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

-- Clean existing duplicate messages FIRST (keep oldest by id)
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY contact_id, remote_message_id 
      ORDER BY created_at ASC
    ) as rn
  FROM public.inbox_messages
  WHERE remote_message_id IS NOT NULL
)
DELETE FROM public.inbox_messages
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Now create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_unique_remote_id 
ON public.inbox_messages (contact_id, remote_message_id) 
WHERE remote_message_id IS NOT NULL;