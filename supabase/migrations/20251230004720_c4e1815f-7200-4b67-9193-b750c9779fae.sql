-- Limpar tabelas vazias e não utilizadas

-- Deletar dados antigos de diagnóstico (mais de 7 dias)
DELETE FROM public.webhook_diagnostics 
WHERE received_at < now() - interval '7 days';

-- Deletar atividades antigas (mais de 30 dias)
DELETE FROM public.user_activities 
WHERE created_at < now() - interval '30 days';

-- Limpar tabela de histórico de webhook (dados de debug antigos)
DELETE FROM public.webhook_history;

-- Limpar logs de ingest de ads que já foram processados
DELETE FROM public.ads_lead_ingest_logs 
WHERE created_at < now() - interval '7 days';