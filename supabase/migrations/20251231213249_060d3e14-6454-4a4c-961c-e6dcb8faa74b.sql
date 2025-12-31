-- Criar tabela de configuração global de API WhatsApp
CREATE TABLE public.whatsapp_api_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active_provider text NOT NULL DEFAULT 'evolution',
  evolution_base_url text,
  evolution_api_key text,
  uazapi_base_url text DEFAULT 'https://zapdata.uazapi.com',
  uazapi_api_token text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_api_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Admins can manage API config" ON public.whatsapp_api_config
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone authenticated can view config" ON public.whatsapp_api_config
FOR SELECT USING (auth.role() = 'authenticated');

-- Inserir configuração inicial com UazAPI como padrão
INSERT INTO public.whatsapp_api_config (active_provider, uazapi_base_url)
VALUES ('uazapi', 'https://zapdata.uazapi.com');

-- Adicionar colunas na tabela maturador_instances
ALTER TABLE public.maturador_instances 
ADD COLUMN IF NOT EXISTS api_provider text DEFAULT 'evolution',
ADD COLUMN IF NOT EXISTS uazapi_token text;