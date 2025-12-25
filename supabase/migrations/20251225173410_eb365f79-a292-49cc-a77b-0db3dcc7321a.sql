-- Add country column to proxy_orders table
ALTER TABLE public.proxy_orders ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'br';

-- Update existing orders to have Brazil as default
UPDATE public.proxy_orders SET country = 'br' WHERE country IS NULL;