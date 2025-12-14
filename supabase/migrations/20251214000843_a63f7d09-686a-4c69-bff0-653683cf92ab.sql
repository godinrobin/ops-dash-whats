-- Criar função update_updated_at_column se não existir
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Tabela de saldo dos usuários para SMS
CREATE TABLE public.sms_user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  country_code VARCHAR(10) DEFAULT '73',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_user_wallets ENABLE ROW LEVEL SECURITY;

-- Policies para sms_user_wallets
CREATE POLICY "Users can view their own wallet"
ON public.sms_user_wallets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wallet"
ON public.sms_user_wallets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallet"
ON public.sms_user_wallets FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can update any wallet"
ON public.sms_user_wallets FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all wallets"
ON public.sms_user_wallets FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de pedidos/compras de números
CREATE TABLE public.sms_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sms_activate_id VARCHAR(100) NOT NULL,
  phone_number VARCHAR(50),
  service_code VARCHAR(20) NOT NULL,
  service_name VARCHAR(100),
  country_code VARCHAR(10),
  price DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  sms_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_orders ENABLE ROW LEVEL SECURITY;

-- Policies para sms_orders
CREATE POLICY "Users can view their own orders"
ON public.sms_orders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own orders"
ON public.sms_orders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own orders"
ON public.sms_orders FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders"
ON public.sms_orders FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de transações/recargas
CREATE TABLE public.sms_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  order_id UUID REFERENCES public.sms_orders(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_transactions ENABLE ROW LEVEL SECURITY;

-- Policies para sms_transactions
CREATE POLICY "Users can view their own transactions"
ON public.sms_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
ON public.sms_transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
ON public.sms_transactions FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert transactions"
ON public.sms_transactions FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Triggers para atualizar updated_at
CREATE TRIGGER update_sms_user_wallets_updated_at
BEFORE UPDATE ON public.sms_user_wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_orders_updated_at
BEFORE UPDATE ON public.sms_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();