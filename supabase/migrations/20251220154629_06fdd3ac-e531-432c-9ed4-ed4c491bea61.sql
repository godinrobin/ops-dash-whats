-- Tabela de configuração global do Maturador (URL e API Key da Evolution)
CREATE TABLE public.maturador_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  evolution_base_url TEXT NOT NULL,
  evolution_api_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Tabela de personas (estilos de conversa)
CREATE TABLE public.maturador_personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'casual',
  greeting_morning TEXT DEFAULT 'Bom dia!',
  greeting_afternoon TEXT DEFAULT 'Boa tarde!',
  greeting_evening TEXT DEFAULT 'Boa noite!',
  message_templates JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de instâncias/chips de WhatsApp
CREATE TABLE public.maturador_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_name TEXT NOT NULL,
  phone_number TEXT,
  label TEXT,
  persona_id UUID REFERENCES public.maturador_personas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  qrcode TEXT,
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de conversas/pareamentos
CREATE TABLE public.maturador_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  chip_a_id UUID REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  chip_b_id UUID REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  min_delay_seconds INTEGER NOT NULL DEFAULT 30,
  max_delay_seconds INTEGER NOT NULL DEFAULT 120,
  messages_per_round INTEGER NOT NULL DEFAULT 5,
  daily_limit INTEGER NOT NULL DEFAULT 50,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',
  topics JSONB DEFAULT '[]'::jsonb,
  schedule JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de histórico de mensagens
CREATE TABLE public.maturador_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.maturador_conversations(id) ON DELETE CASCADE,
  from_instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  to_instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maturador_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maturador_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maturador_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maturador_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maturador_messages ENABLE ROW LEVEL SECURITY;

-- Policies for maturador_config
CREATE POLICY "Users can view their own config" ON public.maturador_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own config" ON public.maturador_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own config" ON public.maturador_config FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own config" ON public.maturador_config FOR DELETE USING (auth.uid() = user_id);

-- Policies for maturador_personas
CREATE POLICY "Users can view their own personas" ON public.maturador_personas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own personas" ON public.maturador_personas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own personas" ON public.maturador_personas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own personas" ON public.maturador_personas FOR DELETE USING (auth.uid() = user_id);

-- Policies for maturador_instances
CREATE POLICY "Users can view their own instances" ON public.maturador_instances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own instances" ON public.maturador_instances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own instances" ON public.maturador_instances FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own instances" ON public.maturador_instances FOR DELETE USING (auth.uid() = user_id);

-- Policies for maturador_conversations
CREATE POLICY "Users can view their own conversations" ON public.maturador_conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own conversations" ON public.maturador_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own conversations" ON public.maturador_conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own conversations" ON public.maturador_conversations FOR DELETE USING (auth.uid() = user_id);

-- Policies for maturador_messages
CREATE POLICY "Users can view their own messages" ON public.maturador_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own messages" ON public.maturador_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_maturador_config_updated_at BEFORE UPDATE ON public.maturador_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maturador_personas_updated_at BEFORE UPDATE ON public.maturador_personas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maturador_instances_updated_at BEFORE UPDATE ON public.maturador_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maturador_conversations_updated_at BEFORE UPDATE ON public.maturador_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();