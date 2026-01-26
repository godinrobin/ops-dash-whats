-- Create table for Logzz cart abandonment events
CREATE TABLE public.logzz_cart_abandonments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  webhook_id UUID REFERENCES public.logzz_webhooks(id) ON DELETE CASCADE,
  -- Client info
  client_name TEXT,
  client_email TEXT,
  client_document TEXT,
  client_phone TEXT,
  client_zip_code TEXT,
  client_address TEXT,
  client_address_number TEXT,
  client_address_district TEXT,
  client_address_comp TEXT,
  client_address_city TEXT,
  client_address_state TEXT,
  client_address_country TEXT,
  -- Cart info
  date_open_cart TIMESTAMPTZ,
  cart_status TEXT,
  -- Offer info
  sale_name TEXT,
  checkout_url TEXT,
  -- Producer/Affiliate
  producer_name TEXT,
  producer_email TEXT,
  affiliate_name TEXT,
  affiliate_email TEXT,
  affiliate_phone TEXT,
  -- Products
  products JSONB,
  -- Raw payload
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.logzz_cart_abandonments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own cart abandonments"
ON public.logzz_cart_abandonments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cart abandonments"
ON public.logzz_cart_abandonments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all cart abandonments"
ON public.logzz_cart_abandonments
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_logzz_cart_abandonments_user_id ON public.logzz_cart_abandonments(user_id);
CREATE INDEX idx_logzz_cart_abandonments_webhook_id ON public.logzz_cart_abandonments(webhook_id);
CREATE INDEX idx_logzz_cart_abandonments_created_at ON public.logzz_cart_abandonments(created_at DESC);