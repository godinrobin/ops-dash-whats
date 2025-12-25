-- Create proxy gateway configuration table
CREATE TABLE public.proxy_gateway_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_type TEXT NOT NULL UNIQUE CHECK (plan_type IN ('residential', 'isp', 'datacenter')),
  gateway_pattern TEXT NOT NULL,
  gateway_host TEXT NOT NULL,
  gateway_port TEXT NOT NULL DEFAULT '16666',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proxy_gateway_config ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read gateway config
CREATE POLICY "Anyone can read gateway config"
ON public.proxy_gateway_config
FOR SELECT
USING (true);

-- Only admins can manage gateway config
CREATE POLICY "Admins can manage gateway config"
ON public.proxy_gateway_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default gateway configurations
INSERT INTO public.proxy_gateway_config (plan_type, gateway_pattern, gateway_host, gateway_port, description) VALUES
('residential', 'pr-*.pyproxy.com', 'pr.pyproxy.io', '16666', 'Residential Rotating Proxy'),
('isp', 'isp-*.pyproxy.com', 'isp.pyproxy.io', '16666', 'ISP Rotating Proxy'),
('datacenter', 'dc-*.pyproxy.com', 'dc.pyproxy.io', '16666', 'Datacenter Proxy');

-- Add new columns to proxy_orders for plan tracking
ALTER TABLE public.proxy_orders 
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'residential' CHECK (plan_type IN ('residential', 'isp', 'datacenter')),
ADD COLUMN IF NOT EXISTS gateway_used TEXT,
ADD COLUMN IF NOT EXISTS test_result TEXT,
ADD COLUMN IF NOT EXISTS test_ip TEXT;