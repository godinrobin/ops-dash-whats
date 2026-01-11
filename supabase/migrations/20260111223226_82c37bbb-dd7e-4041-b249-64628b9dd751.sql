-- Add proxy_string column to maturador_instances table
ALTER TABLE public.maturador_instances 
ADD COLUMN IF NOT EXISTS proxy_string TEXT DEFAULT NULL;