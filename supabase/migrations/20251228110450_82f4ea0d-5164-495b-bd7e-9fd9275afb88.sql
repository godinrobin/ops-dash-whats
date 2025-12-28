-- Create table for user payment webhooks
CREATE TABLE public.user_payment_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  webhook_id VARCHAR(20) NOT NULL UNIQUE,
  bank_type VARCHAR(20) NOT NULL CHECK (bank_type IN ('inter', 'infinitepay')),
  is_active BOOLEAN DEFAULT true,
  notifications_count INTEGER DEFAULT 0,
  total_received DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_payment_webhooks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own webhooks"
  ON public.user_payment_webhooks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own webhooks"
  ON public.user_payment_webhooks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own webhooks"
  ON public.user_payment_webhooks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own webhooks"
  ON public.user_payment_webhooks FOR DELETE
  USING (auth.uid() = user_id);

-- Create table for payment notification history
CREATE TABLE public.payment_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES public.user_payment_webhooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payer_name VARCHAR(255),
  bank_type VARCHAR(20) NOT NULL,
  raw_payload JSONB,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own notifications"
  ON public.payment_notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_payment_webhooks_user_id ON public.user_payment_webhooks(user_id);
CREATE INDEX idx_payment_webhooks_webhook_id ON public.user_payment_webhooks(webhook_id);
CREATE INDEX idx_payment_notifications_webhook_id ON public.payment_notifications(webhook_id);
CREATE INDEX idx_payment_notifications_user_id ON public.payment_notifications(user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_payment_webhooks_updated_at
  BEFORE UPDATE ON public.user_payment_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();