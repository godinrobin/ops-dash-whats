-- Inserir subscriptions para instâncias existentes
-- Membros completos (não semi-full) recebem as 3 primeiras instâncias gratuitas
-- Demais instâncias expiram em 30 dias

INSERT INTO public.instance_subscriptions (instance_id, user_id, is_free, expires_at, created_at)
SELECT 
  mi.id as instance_id,
  mi.user_id,
  CASE 
    WHEN p.is_full_member = true 
         AND (p.is_semi_full_member IS NULL OR p.is_semi_full_member = false)
         AND row_num <= 3 THEN true
    ELSE false
  END as is_free,
  CASE 
    WHEN p.is_full_member = true 
         AND (p.is_semi_full_member IS NULL OR p.is_semi_full_member = false)
         AND row_num <= 3 THEN NULL
    ELSE NOW() + INTERVAL '30 days'
  END as expires_at,
  mi.created_at
FROM (
  SELECT 
    id, 
    user_id, 
    created_at,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as row_num
  FROM public.maturador_instances
  WHERE status IN ('connected', 'open')
) mi
JOIN public.profiles p ON p.id = mi.user_id
ON CONFLICT (instance_id) DO NOTHING;