-- Add webhook_id column to logzz_orders table
ALTER TABLE public.logzz_orders 
ADD COLUMN IF NOT EXISTS webhook_id uuid REFERENCES public.logzz_webhooks(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_logzz_orders_webhook_id ON public.logzz_orders(webhook_id);
CREATE INDEX IF NOT EXISTS idx_logzz_orders_user_created ON public.logzz_orders(user_id, created_at DESC);