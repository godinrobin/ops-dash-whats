-- Add message_type column to track text/audio/image messages
ALTER TABLE public.maturador_messages 
ADD COLUMN message_type TEXT DEFAULT 'text';

-- Add index for efficient querying by message type per instance
CREATE INDEX idx_maturador_messages_type_instance 
ON public.maturador_messages(conversation_id, from_instance_id, message_type);