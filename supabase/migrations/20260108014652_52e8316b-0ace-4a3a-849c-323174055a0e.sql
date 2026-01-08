-- Add column to store the replied message id
ALTER TABLE public.inbox_messages 
ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL;