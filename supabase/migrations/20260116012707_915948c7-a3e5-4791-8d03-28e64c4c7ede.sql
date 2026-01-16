-- 1. Verificar e criar índices nas tabelas mais acessadas

-- inbox_messages: índice para queries por contact_id e created_at
CREATE INDEX IF NOT EXISTS idx_inbox_messages_contact_created 
ON public.inbox_messages (contact_id, created_at DESC);

-- inbox_flow_analytics: índice para queries por flow_id e created_at
CREATE INDEX IF NOT EXISTS idx_inbox_flow_analytics_flow_created 
ON public.inbox_flow_analytics (flow_id, created_at DESC);

-- inbox_flow_sessions: índice para queries por status e contact_id
CREATE INDEX IF NOT EXISTS idx_inbox_flow_sessions_status_contact 
ON public.inbox_flow_sessions (status, contact_id);

-- inbox_flow_sessions: índice para queries de processamento
CREATE INDEX IF NOT EXISTS idx_inbox_flow_sessions_processing 
ON public.inbox_flow_sessions (processing, processing_started_at)
WHERE processing = true;

-- inbox_contacts: índice para queries por last_message_at
CREATE INDEX IF NOT EXISTS idx_inbox_contacts_last_message 
ON public.inbox_contacts (user_id, last_message_at DESC NULLS LAST);

-- user_activities: índice para queries por user_id e created_at
CREATE INDEX IF NOT EXISTS idx_user_activities_user_created 
ON public.user_activities (user_id, created_at DESC);