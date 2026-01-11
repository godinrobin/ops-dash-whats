-- Add state and city columns for Brazil state/city targeting
ALTER TABLE public.proxy_orders 
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS city text;