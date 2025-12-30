-- Add media_pending column to track messages with failed media persistence
ALTER TABLE public.inbox_messages 
ADD COLUMN IF NOT EXISTS media_pending boolean DEFAULT false;

-- Add index for efficient querying of pending media
CREATE INDEX IF NOT EXISTS idx_inbox_messages_media_pending 
ON public.inbox_messages (media_pending) 
WHERE media_pending = true;

-- Mark existing messages with temporary WhatsApp URLs as pending for reprocessing
UPDATE public.inbox_messages 
SET media_pending = true 
WHERE media_url IS NOT NULL 
  AND media_url != ''
  AND (
    media_url LIKE '%mmg.whatsapp.net%' 
    OR media_url LIKE '%cdn.whatsapp.net%'
    OR media_url LIKE '%web.whatsapp.com%'
  )
  AND media_url NOT LIKE '%supabase%';