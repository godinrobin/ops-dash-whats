-- Add event_type and flow_id columns to logzz_webhooks
ALTER TABLE public.logzz_webhooks 
ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'pedido',
ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.inbox_flows(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS name TEXT;

-- Update existing rows with default name
UPDATE public.logzz_webhooks SET name = 'Integração Logzz' WHERE name IS NULL;