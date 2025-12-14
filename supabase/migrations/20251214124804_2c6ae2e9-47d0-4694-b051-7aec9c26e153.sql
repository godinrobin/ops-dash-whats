-- Create marketplace_products table
CREATE TABLE public.marketplace_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC NOT NULL,
  compare_price NUMERIC,
  discount_percent INTEGER,
  category TEXT NOT NULL,
  image_url TEXT,
  is_sold_out BOOLEAN NOT NULL DEFAULT false,
  stock INTEGER DEFAULT 999,
  sold_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create marketplace_orders table for asset sales
CREATE TABLE public.marketplace_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.marketplace_products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_price NUMERIC NOT NULL,
  customer_name TEXT,
  customer_whatsapp TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on marketplace_products
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;

-- Anyone can view products
CREATE POLICY "Anyone can view marketplace products"
ON public.marketplace_products
FOR SELECT
USING (true);

-- Only admins can manage products
CREATE POLICY "Admins can manage marketplace products"
ON public.marketplace_products
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable RLS on marketplace_orders
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view their own marketplace orders"
ON public.marketplace_orders
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own orders
CREATE POLICY "Users can insert their own marketplace orders"
ON public.marketplace_orders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own orders
CREATE POLICY "Users can update their own marketplace orders"
ON public.marketplace_orders
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all orders
CREATE POLICY "Admins can view all marketplace orders"
ON public.marketplace_orders
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all orders
CREATE POLICY "Admins can update all marketplace orders"
ON public.marketplace_orders
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_marketplace_products_updated_at
BEFORE UPDATE ON public.marketplace_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketplace_orders_updated_at
BEFORE UPDATE ON public.marketplace_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial products
INSERT INTO public.marketplace_products (name, description, price, compare_price, discount_percent, category, image_url, stock) VALUES
('BM Verificada - Platina', '✅Verificada CNPJ 

➡️BM 50 à 300 (Limite Diário)

✅ Libera até 3 contas', 97.00, 129.00, 25, 'BM', '/assets/bm-verificada.png', 10),

('BM Verificada - Ouro', '✅Liberada api oficial do whatsapp 

✅Verificada CNPJ 

➡️BM verificada liberada 250 mensagens diárias', 210.00, 280.00, 25, 'BM', '/assets/bm-verificada.png', 10),

('BM Verificada - Diamante', '✅Liberada api oficial do whatsapp 

✅Verificada CNPJ 

➡️BM verificada liberada 1k mensagens diárias', 530.00, 690.00, 23, 'BM', '/assets/bm-verificada.png', 10),

('BM Simples', '👉 BM 50 à 300 (Limite Diário) 

✅ Libera até 3 Contas', 49.90, 69.90, 29, 'BM', '/assets/bm-simples.png', 10),

('Perfil Antigo Real', '✅ Pronto para anunciar

✅ R$250,00 de limite diário de gastos

✅ Média de 1 ano de criação

✅ Pode anunciar para Whatsapp pela conta pessoal de anúncios

✅ E-mail, Senha, 2 Fatores e Cookies

✅ Garantia e Suporte', 99.90, 139.90, 29, 'Perfil', '/assets/perfil-antigo-real.png', 10),

('Perfil Comum', '✅ Pronto para anunciar

✅ R$250,00 de limíte diário de gastos

✅ Média de 6 meses de criação

✅ Pode anunciar para Whatsapp pela conta pessoal de anúncios

✅ E-mail, Senha, 2 Fatores e Cookies

✅ Garantia e Suporte', 69.90, 99.90, 30, 'Perfil', '/assets/perfil-comum.png', 10),

('Perfil Reestabelecido', '✅ Perfil Restabelecido com RG ou Selfie

✅ Pronto para anunciar

✅ R$250,00 de limíte diário de gastos

✅ Média de 6 meses de criação

✅ Pode anunciar para Whatsapp pela conta pessoal de anúncios

✅ E-mail, Senha, 2 Fatores e Cookies

✅ Garantia e Suporte', 119.90, 159.90, 25, 'Perfil', '/assets/perfil-reestabelecido.png', 10),

('Perfil Verificado', '✅ Perfil Verificado com RG ou CNH

✅ Selo de Verificação verde

✅ Disponibilizamos o doc em caso de bloqueio

✅ Pronto para anunciar

✅ R$250,00 de limíte diário de gastos

✅ Média de 6 meses de criação

✅ Pode anunciar para Whatsapp pela conta pessoal de anúncios

✅ E-mail, Senha, 2 Fatores e Cookies

✅ Garantia e Suporte', 139.90, 179.90, 22, 'Perfil', '/assets/perfil-verificado.png', 10),

('Combo Master', '✅ Perfil Reestabelecido

✅ BM 250 Antiga

✅ Página Antiga', 199.00, 269.00, 26, 'Combo', '/assets/combo-master.png', 10),

('Combo Diamond', '✅ Perfil Verificado

✅ BM 250 Antiga

✅ Página Antiga', 220.00, 299.00, 26, 'Combo', '/assets/combo-diamond.png', 10);