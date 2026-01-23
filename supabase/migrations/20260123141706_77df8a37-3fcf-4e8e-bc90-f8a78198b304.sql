-- =============================================
-- SISTEMA DE CRÉDITOS ZAPDATA - FASE 1
-- =============================================

-- 1. Tabela de saldo de créditos por usuário
CREATE TABLE public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance NUMERIC(10,2) DEFAULT 0 NOT NULL CHECK (balance >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de histórico de transações
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'admin_grant', 'admin_deduct')),
  description TEXT NOT NULL,
  system_id TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de pacotes de créditos
CREATE TABLE public.credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  price_brl NUMERIC(10,2) NOT NULL CHECK (price_brl > 0),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de preços dos sistemas
CREATE TABLE public.system_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id TEXT UNIQUE NOT NULL,
  system_name TEXT NOT NULL,
  price_type TEXT NOT NULL CHECK (price_type IN ('per_use', 'monthly', 'lifetime', 'per_batch')),
  credit_cost NUMERIC(10,2) NOT NULL CHECK (credit_cost >= 0),
  free_tier_limit INTEGER DEFAULT 0,
  free_tier_period TEXT CHECK (free_tier_period IN ('day', '10min', 'month', NULL)),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela de acesso a sistemas pagos (lifetime/subscription)
CREATE TABLE public.user_system_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  system_id TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('subscription', 'lifetime')),
  expires_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, system_id)
);

-- 6. Tabela de uso do tier grátis
CREATE TABLE public.user_free_tier_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  system_id TEXT NOT NULL,
  usage_count INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, system_id, period_start)
);

-- 7. Tabela de assinaturas de instâncias
CREATE TABLE public.instance_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  is_free BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_renewal TIMESTAMPTZ,
  warning_shown BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabela de configuração global do sistema
CREATE TABLE public.credits_system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ÍNDICES
-- =============================================
CREATE INDEX idx_user_credits_user_id ON public.user_credits(user_id);
CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);
CREATE INDEX idx_user_system_access_user_id ON public.user_system_access(user_id);
CREATE INDEX idx_user_system_access_expires ON public.user_system_access(expires_at);
CREATE INDEX idx_user_free_tier_usage_user_system ON public.user_free_tier_usage(user_id, system_id);
CREATE INDEX idx_instance_subscriptions_user_id ON public.instance_subscriptions(user_id);
CREATE INDEX idx_instance_subscriptions_expires ON public.instance_subscriptions(expires_at);

-- =============================================
-- TRIGGERS PARA updated_at
-- =============================================
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_pricing_updated_at
  BEFORE UPDATE ON public.system_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credits_system_config_updated_at
  BEFORE UPDATE ON public.credits_system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- RLS POLICIES
-- =============================================

-- user_credits: usuários só veem seu próprio saldo
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits"
  ON public.user_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credits"
  ON public.user_credits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credits"
  ON public.user_credits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all credits"
  ON public.user_credits FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- credit_transactions: usuários só veem suas próprias transações
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all transactions"
  ON public.credit_transactions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- credit_packages: todos podem ver, admin pode editar
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packages"
  ON public.credit_packages FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage packages"
  ON public.credit_packages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- system_pricing: todos podem ver, admin pode editar
ALTER TABLE public.system_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pricing"
  ON public.system_pricing FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage pricing"
  ON public.system_pricing FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- user_system_access: usuários só veem seu próprio acesso
ALTER TABLE public.user_system_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access"
  ON public.user_system_access FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own access"
  ON public.user_system_access FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all access"
  ON public.user_system_access FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- user_free_tier_usage: usuários só veem seu próprio uso
ALTER TABLE public.user_free_tier_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.user_free_tier_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own usage"
  ON public.user_free_tier_usage FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all usage"
  ON public.user_free_tier_usage FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- instance_subscriptions: usuários só veem suas próprias instâncias
ALTER TABLE public.instance_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON public.instance_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own subscriptions"
  ON public.instance_subscriptions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all subscriptions"
  ON public.instance_subscriptions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- credits_system_config: todos podem ler, admin pode editar
ALTER TABLE public.credits_system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view config"
  ON public.credits_system_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage config"
  ON public.credits_system_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- DADOS INICIAIS
-- =============================================

-- Configuração inicial do sistema (inativo)
INSERT INTO public.credits_system_config (key, value) VALUES
  ('system_status', '{"status": "inactive", "activated_at": null}'::jsonb);

-- Pacotes de créditos iniciais
INSERT INTO public.credit_packages (name, credits, price_brl, sort_order) VALUES
  ('Pacote Inicial', 10, 65.00, 1),
  ('Pacote Básico', 20, 120.00, 2),
  ('Pacote Avançado', 50, 300.00, 3),
  ('Pacote Profissional', 100, 500.00, 4);

-- Preços dos sistemas
INSERT INTO public.system_pricing (system_id, system_name, price_type, credit_cost, free_tier_limit, free_tier_period, description) VALUES
  -- Sistemas de assinatura/lifetime (membro parcial)
  ('zap_spy', 'Zap Spy', 'monthly', 2.00, 0, NULL, 'Acesso mensal ao Zap Spy'),
  ('extensao_ads', 'Extensão ADS WhatsApp', 'lifetime', 1.50, 0, NULL, 'Acesso vitalício à extensão'),
  ('zap_converter', 'Zap Converter', 'lifetime', 1.50, 0, NULL, 'Acesso vitalício ao conversor'),
  
  -- Sistemas por uso (membro parcial)
  ('gerador_palavras_chave', 'Gerador de Palavras-Chave', 'per_use', 0.01, 0, NULL, 'Por mensagem'),
  ('gerador_funil', 'Gerador de Funil', 'per_use', 0.10, 0, NULL, 'Por funil gerado'),
  ('edicao_funil_ia', 'Edição de Funil com IA', 'per_use', 0.05, 0, NULL, 'Por edição'),
  ('gerador_criativos', 'Gerador de Criativos', 'per_use', 0.20, 3, 'day', 'Por imagem - 3 grátis/dia para membro completo'),
  ('gerador_videos', 'Gerador de Variações de Vídeo', 'per_use', 0.10, 0, NULL, 'Por variação'),
  ('gerador_audio', 'Gerador de Áudio', 'per_use', 0.15, 3, '10min', 'Por áudio - 3 grátis/10min + 10/dia para membro completo'),
  ('transcricao_audio', 'Transcrição de Áudio', 'per_use', 0.05, 0, NULL, 'Por transcrição'),
  ('analisador_criativos', 'Analisador de Criativos', 'per_use', 0.20, 0, NULL, 'Por análise'),
  ('criador_entregavel', 'Criador de Entregável', 'per_batch', 0.10, 30, 'day', 'Por 30 prompts - 30 grátis/dia para membro completo'),
  
  -- Instâncias WhatsApp
  ('instancia_whatsapp', 'Instância WhatsApp Extra', 'monthly', 6.00, 3, NULL, '3 grátis para membro completo, depois 6 créditos/30 dias');

-- =============================================
-- FUNÇÃO PARA DEDUZIR CRÉDITOS
-- =============================================
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_system_id TEXT,
  p_description TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance NUMERIC;
BEGIN
  -- Buscar saldo atual com lock
  SELECT balance INTO v_current_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Se não existe registro, criar com saldo 0
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance)
    VALUES (p_user_id, 0);
    v_current_balance := 0;
  END IF;
  
  -- Verificar se tem saldo suficiente
  IF v_current_balance < p_amount THEN
    RETURN FALSE;
  END IF;
  
  -- Deduzir créditos
  UPDATE public.user_credits
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Registrar transação
  INSERT INTO public.credit_transactions (user_id, amount, type, description, system_id)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_system_id);
  
  RETURN TRUE;
END;
$$;

-- =============================================
-- FUNÇÃO PARA ADICIONAR CRÉDITOS
-- =============================================
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_type TEXT,
  p_description TEXT,
  p_reference_id TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inserir ou atualizar saldo
  INSERT INTO public.user_credits (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + p_amount,
      updated_at = now();
  
  -- Registrar transação
  INSERT INTO public.credit_transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, p_amount, p_type, p_description, p_reference_id);
  
  RETURN TRUE;
END;
$$;

-- =============================================
-- FUNÇÃO PARA VERIFICAR STATUS DO SISTEMA
-- =============================================
CREATE OR REPLACE FUNCTION public.get_credits_system_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config JSONB;
BEGIN
  SELECT value INTO v_config
  FROM public.credits_system_config
  WHERE key = 'system_status';
  
  RETURN COALESCE(v_config, '{"status": "inactive", "activated_at": null}'::jsonb);
END;
$$;