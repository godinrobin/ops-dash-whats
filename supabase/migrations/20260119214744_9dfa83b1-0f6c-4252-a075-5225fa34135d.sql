-- Drop the old check constraint and create a new one with mobile type
ALTER TABLE public.proxy_gateway_config 
DROP CONSTRAINT IF EXISTS proxy_gateway_config_plan_type_check;

ALTER TABLE public.proxy_gateway_config 
ADD CONSTRAINT proxy_gateway_config_plan_type_check 
CHECK (plan_type = ANY (ARRAY['residential'::text, 'isp'::text, 'datacenter'::text, 'mobile'::text]));

-- Add mobile proxy gateway configuration
INSERT INTO public.proxy_gateway_config (plan_type, gateway_pattern, gateway_host, gateway_port, description)
VALUES ('mobile', 'pr.pyproxy.com:16666', 'pr.pyproxy.com', '16666', 'Mobile Proxy - IPs de operadoras móveis para WhatsApp')
ON CONFLICT (plan_type) DO UPDATE SET 
  gateway_host = EXCLUDED.gateway_host,
  gateway_port = EXCLUDED.gateway_port,
  description = EXCLUDED.description;

-- Add proxy price configurations for each type
CREATE TABLE IF NOT EXISTS public.proxy_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_type text UNIQUE NOT NULL,
  price_brl numeric(10,2) NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proxy_prices ENABLE ROW LEVEL SECURITY;

-- Admin can read/write prices
CREATE POLICY "Admins can manage proxy prices"
ON public.proxy_prices
FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Anyone can read prices (for purchase flow)
CREATE POLICY "Anyone can read proxy prices"
ON public.proxy_prices
FOR SELECT
USING (true);

-- Insert default prices for each proxy type
INSERT INTO public.proxy_prices (plan_type, price_brl, description) VALUES
('residential', 9.99, 'Proxy Residencial - IPs residenciais rotativos'),
('mobile', 14.50, 'Proxy Mobile - IPs de operadoras móveis'),
('datacenter', 50.00, 'Proxy Dedicada - IP fixo de datacenter de alta velocidade')
ON CONFLICT (plan_type) DO UPDATE SET
  price_brl = EXCLUDED.price_brl,
  description = EXCLUDED.description;