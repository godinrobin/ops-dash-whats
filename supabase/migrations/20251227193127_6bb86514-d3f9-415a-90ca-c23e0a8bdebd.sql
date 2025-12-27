-- Remove old unique constraint on (user_id, phone)
ALTER TABLE public.inbox_contacts DROP CONSTRAINT IF EXISTS inbox_contacts_user_phone_unique;

-- Add new unique constraint on (user_id, instance_id, phone)
-- This allows same phone to have separate contacts per instance
ALTER TABLE public.inbox_contacts ADD CONSTRAINT inbox_contacts_user_instance_phone_unique UNIQUE (user_id, instance_id, phone);

-- Add index for performance on inbox list queries
CREATE INDEX IF NOT EXISTS idx_inbox_contacts_user_instance_lastmsg ON public.inbox_contacts (user_id, instance_id, last_message_at DESC);