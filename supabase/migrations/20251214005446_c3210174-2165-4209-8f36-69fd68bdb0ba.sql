-- Create smm_orders table for SMM panel orders
CREATE TABLE public.smm_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  smm_raja_order_id TEXT,
  service_id INTEGER NOT NULL,
  service_name TEXT NOT NULL,
  category TEXT,
  link TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_usd NUMERIC(10,5) NOT NULL,
  price_brl NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  start_count INTEGER,
  remains INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.smm_orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view their own smm orders"
ON public.smm_orders
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own orders
CREATE POLICY "Users can insert their own smm orders"
ON public.smm_orders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own orders
CREATE POLICY "Users can update their own smm orders"
ON public.smm_orders
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all orders
CREATE POLICY "Admins can view all smm orders"
ON public.smm_orders
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_smm_orders_updated_at
BEFORE UPDATE ON public.smm_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();