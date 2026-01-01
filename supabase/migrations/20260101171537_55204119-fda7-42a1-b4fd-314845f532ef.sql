-- Add enable_calls column to maturador_conversations table
ALTER TABLE public.maturador_conversations 
ADD COLUMN IF NOT EXISTS enable_calls boolean DEFAULT false;