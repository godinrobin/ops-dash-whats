-- Add conversation_count and last_conversation_sync columns to maturador_instances
ALTER TABLE public.maturador_instances 
ADD COLUMN IF NOT EXISTS conversation_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_conversation_sync timestamp with time zone;