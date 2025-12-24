-- Add label column to proxy_orders for custom proxy names
ALTER TABLE public.proxy_orders 
ADD COLUMN IF NOT EXISTS label text;