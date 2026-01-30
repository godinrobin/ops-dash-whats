-- Add instance_id column to logzz_webhooks table to store assigned instance
ALTER TABLE public.logzz_webhooks 
ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_logzz_webhooks_instance_id ON public.logzz_webhooks(instance_id);

-- Add comment
COMMENT ON COLUMN public.logzz_webhooks.instance_id IS 'Instance to use for sending flow messages when this webhook is triggered';