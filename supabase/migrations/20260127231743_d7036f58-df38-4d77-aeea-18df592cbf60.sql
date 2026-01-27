-- Atualizar instâncias pagas existentes que nunca foram renovadas para 3 dias
UPDATE instance_subscriptions
SET expires_at = NOW() + INTERVAL '3 days'
WHERE is_free = false 
  AND last_renewal IS NULL
  AND expires_at IS NOT NULL;