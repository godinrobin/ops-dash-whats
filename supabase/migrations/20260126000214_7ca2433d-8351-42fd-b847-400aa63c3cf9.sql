-- Tabela para armazenar tokens de webhook por usuário
CREATE TABLE public.logzz_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  webhook_token UUID NOT NULL DEFAULT gen_random_uuid(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(webhook_token)
);

-- Tabela para armazenar pedidos recebidos
CREATE TABLE public.logzz_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Informações do cliente
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
  -- Informações do pedido
  order_number TEXT,
  date_order TIMESTAMPTZ,
  date_order_day TEXT,
  date_delivery TIMESTAMPTZ,
  date_delivery_day TEXT,
  delivery_estimate TEXT,
  order_status TEXT,
  order_status_description TEXT,
  order_quantity INTEGER,
  order_final_price TEXT,
  second_order BOOLEAN,
  first_order BOOLEAN,
  -- Produtos (JSONB)
  products JSONB,
  -- Informações de usuários/logística
  logistic_operator TEXT,
  delivery_man TEXT,
  delivery_man_phone TEXT,
  producer_name TEXT,
  producer_email TEXT,
  affiliate_name TEXT,
  affiliate_email TEXT,
  affiliate_phone TEXT,
  commission TEXT,
  producer_commission TEXT,
  affiliate_commission TEXT,
  -- UTM
  utm_source TEXT,
  utm_content TEXT,
  utm_term TEXT,
  utm_medium TEXT,
  utm_id TEXT,
  utm_campaign TEXT,
  -- Payload original
  raw_payload JSONB,
  webhook_type TEXT DEFAULT 'order',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.logzz_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logzz_orders ENABLE ROW LEVEL SECURITY;

-- Policies para webhooks
CREATE POLICY "Users can view own webhooks" ON public.logzz_webhooks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own webhooks" ON public.logzz_webhooks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own webhooks" ON public.logzz_webhooks
  FOR UPDATE USING (auth.uid() = user_id);

-- Policies para orders
CREATE POLICY "Users can view own orders" ON public.logzz_orders
  FOR SELECT USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_logzz_webhooks_updated_at
  BEFORE UPDATE ON public.logzz_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_logzz_orders_user_id ON public.logzz_orders(user_id);
CREATE INDEX idx_logzz_orders_created_at ON public.logzz_orders(created_at DESC);
CREATE INDEX idx_logzz_webhooks_token ON public.logzz_webhooks(webhook_token);