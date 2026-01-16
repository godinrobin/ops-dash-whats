-- 1. Limpar registros antigos (manter apenas últimos 7 dias) - PRIMEIRO para reduzir tamanho
DELETE FROM public.webhook_diagnostics 
WHERE received_at < NOW() - INTERVAL '7 days';

-- 2. Criar índice para otimizar a query de listagem geral (problema do timeout)
CREATE INDEX IF NOT EXISTS idx_webhook_diagnostics_received_at 
ON public.webhook_diagnostics (received_at DESC);

-- 3. Criar função de limpeza automática
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_diagnostics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.webhook_diagnostics 
  WHERE received_at < NOW() - INTERVAL '7 days';
END;
$$;