-- Alterar a coluna service_id para text para aceitar IDs de serviço como "s1262"
ALTER TABLE public.smm_orders 
ALTER COLUMN service_id TYPE text USING service_id::text;