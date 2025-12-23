-- Table for proxy orders
CREATE TABLE public.proxy_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pyproxy_subuser_id TEXT,
  host TEXT,
  port TEXT,
  username TEXT,
  password TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proxy_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own proxy orders"
  ON public.proxy_orders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own proxy orders"
  ON public.proxy_orders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proxy orders"
  ON public.proxy_orders
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all proxy orders"
  ON public.proxy_orders
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all proxy orders"
  ON public.proxy_orders
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Table for proxy logs
CREATE TABLE public.proxy_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  order_id UUID REFERENCES public.proxy_orders(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  api_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proxy_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for logs
CREATE POLICY "Admins can view all proxy logs"
  ON public.proxy_logs
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert proxy logs"
  ON public.proxy_logs
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR true);

-- Add proxy margin to platform_margins
INSERT INTO public.platform_margins (system_name, margin_percent)
VALUES ('proxy', 50)
ON CONFLICT (system_name) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_proxy_orders_updated_at
  BEFORE UPDATE ON public.proxy_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();