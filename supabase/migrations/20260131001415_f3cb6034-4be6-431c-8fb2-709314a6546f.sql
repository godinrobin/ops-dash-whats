-- Add webhook_id column to logzz_webhook_events to track which webhook triggered each event
ALTER TABLE public.logzz_webhook_events 
ADD COLUMN IF NOT EXISTS webhook_id UUID REFERENCES public.logzz_webhooks(id) ON DELETE SET NULL;

-- Create index for faster queries by webhook_id
CREATE INDEX IF NOT EXISTS idx_logzz_webhook_events_webhook_id 
ON public.logzz_webhook_events(webhook_id);

-- Create composite index for efficient user + webhook filtering
CREATE INDEX IF NOT EXISTS idx_logzz_webhook_events_user_webhook 
ON public.logzz_webhook_events(user_id, webhook_id, created_at DESC);