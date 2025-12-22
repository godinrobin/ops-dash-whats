-- Deduplicate inbox contacts by (user_id, phone) and enforce uniqueness

-- 1) Re-point related rows (messages + flow sessions) to a canonical contact
WITH ranked AS (
  SELECT
    id,
    user_id,
    phone,
    first_value(id) OVER (PARTITION BY user_id, phone ORDER BY created_at ASC, id ASC) AS keep_id,
    row_number() OVER (PARTITION BY user_id, phone ORDER BY created_at ASC, id ASC) AS rn
  FROM public.inbox_contacts
)
UPDATE public.inbox_messages m
SET contact_id = r.keep_id
FROM ranked r
WHERE m.contact_id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    user_id,
    phone,
    first_value(id) OVER (PARTITION BY user_id, phone ORDER BY created_at ASC, id ASC) AS keep_id,
    row_number() OVER (PARTITION BY user_id, phone ORDER BY created_at ASC, id ASC) AS rn
  FROM public.inbox_contacts
)
UPDATE public.inbox_flow_sessions s
SET contact_id = r.keep_id
FROM ranked r
WHERE s.contact_id = r.id
  AND r.rn > 1;

-- 2) Delete duplicate contacts
WITH ranked AS (
  SELECT
    id,
    user_id,
    phone,
    row_number() OVER (PARTITION BY user_id, phone ORDER BY created_at ASC, id ASC) AS rn
  FROM public.inbox_contacts
)
DELETE FROM public.inbox_contacts c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 3) Enforce uniqueness going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'inbox_contacts_user_phone_unique'
  ) THEN
    CREATE UNIQUE INDEX inbox_contacts_user_phone_unique
    ON public.inbox_contacts (user_id, phone);
  END IF;
END $$;