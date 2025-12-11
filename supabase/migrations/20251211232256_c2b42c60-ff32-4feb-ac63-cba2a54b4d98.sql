-- Adicionar coluna para agendamento de avisos
ALTER TABLE public.admin_announcements 
ADD COLUMN scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;