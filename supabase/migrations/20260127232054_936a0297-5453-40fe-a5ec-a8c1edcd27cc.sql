-- Recalcular is_free baseado na ordem de criação: apenas as 3 primeiras de cada usuário são gratuitas
-- As demais devem ser is_free = false com expires_at = 3 dias

WITH ranked_instances AS (
  SELECT 
    id,
    user_id,
    is_free,
    expires_at,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as rn
  FROM instance_subscriptions
)
UPDATE instance_subscriptions s
SET 
  is_free = CASE WHEN r.rn <= 3 THEN true ELSE false END,
  expires_at = CASE 
    WHEN r.rn <= 3 THEN NULL  -- Free instances don't expire
    ELSE COALESCE(s.expires_at, NOW() + INTERVAL '3 days')  -- Paid instances: keep existing or set 3 days
  END
FROM ranked_instances r
WHERE s.id = r.id
  AND (
    -- Update if is_free doesn't match the expected value
    (r.rn <= 3 AND s.is_free = false)
    OR (r.rn > 3 AND s.is_free = true)
    -- Or if paid but no expiration date
    OR (r.rn > 3 AND s.expires_at IS NULL)
  );