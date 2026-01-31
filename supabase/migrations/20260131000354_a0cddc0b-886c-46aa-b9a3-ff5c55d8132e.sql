-- Create table for Global Webhooks (simplified webhook integration)
CREATE TABLE public.global_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  webhook_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  flow_id UUID REFERENCES public.inbox_flows(id) ON DELETE SET NULL,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.global_webhooks ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own global webhooks"
  ON public.global_webhooks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own global webhooks"
  ON public.global_webhooks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own global webhooks"
  ON public.global_webhooks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own global webhooks"
  ON public.global_webhooks FOR DELETE
  USING (auth.uid() = user_id);

-- Create table for Global Webhook Events (history)
CREATE TABLE public.global_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  webhook_id UUID NOT NULL REFERENCES public.global_webhooks(id) ON DELETE CASCADE,
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.global_webhook_events ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own global webhook events"
  ON public.global_webhook_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert global webhook events"
  ON public.global_webhook_events FOR INSERT
  WITH CHECK (true);

-- Add index for webhook_id for fast lookups
CREATE INDEX idx_global_webhook_events_webhook_id ON public.global_webhook_events(webhook_id);
CREATE INDEX idx_global_webhook_events_created_at ON public.global_webhook_events(created_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_global_webhooks_updated_at
  BEFORE UPDATE ON public.global_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();