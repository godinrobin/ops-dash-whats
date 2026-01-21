-- Tabela para armazenar templates de notificação de vendas personalizados
CREATE TABLE public.sale_notification_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title_template TEXT NOT NULL DEFAULT '💰 Nova Venda!',
  body_template TEXT NOT NULL DEFAULT 'Você acabou de fazer uma venda de R$ {valor}!',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.sale_notification_templates ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários podem ver seus próprios templates" 
ON public.sale_notification_templates 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus próprios templates" 
ON public.sale_notification_templates 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus próprios templates" 
ON public.sale_notification_templates 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios templates" 
ON public.sale_notification_templates 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_sale_notification_templates_updated_at
BEFORE UPDATE ON public.sale_notification_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar coluna no profiles para ocultar valor da venda
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS hide_sale_value_in_notification BOOLEAN DEFAULT false;