-- Table to store user saved payment methods (cards)
CREATE TABLE public.user_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_payment_method_id TEXT NOT NULL,
  card_brand TEXT, -- visa, mastercard, etc.
  card_last4 TEXT NOT NULL,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Users can only view their own payment methods
CREATE POLICY "Users can view own payment methods"
ON public.user_payment_methods
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own payment methods
CREATE POLICY "Users can add own payment methods"
ON public.user_payment_methods
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own payment methods
CREATE POLICY "Users can update own payment methods"
ON public.user_payment_methods
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own payment methods
CREATE POLICY "Users can delete own payment methods"
ON public.user_payment_methods
FOR DELETE
USING (auth.uid() = user_id);

-- Add auto_renewal_enabled field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS auto_renewal_enabled BOOLEAN DEFAULT true;

-- Add credit_price_brl to credits_system_config if not exists
INSERT INTO public.credits_system_config (key, value)
VALUES ('credit_price_brl', '6.50'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Table for renewal attempt logs
CREATE TABLE public.instance_renewal_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  renewal_type TEXT NOT NULL, -- 'credits', 'card', 'failed'
  credits_used NUMERIC,
  card_amount_charged NUMERIC,
  payment_method_id UUID REFERENCES public.user_payment_methods(id) ON DELETE SET NULL,
  status TEXT NOT NULL, -- 'success', 'failed', 'pending'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instance_renewal_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own renewal logs
CREATE POLICY "Users can view own renewal logs"
ON public.instance_renewal_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert logs
CREATE POLICY "Service can insert renewal logs"
ON public.instance_renewal_logs
FOR INSERT
WITH CHECK (true);

-- Create trigger for updated_at on user_payment_methods
CREATE TRIGGER update_user_payment_methods_updated_at
BEFORE UPDATE ON public.user_payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();