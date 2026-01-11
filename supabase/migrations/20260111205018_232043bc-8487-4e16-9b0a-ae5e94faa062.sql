-- Atomically claim notifications to prevent duplicate sends when multiple workers run in parallel
-- Uses row-level locks with SKIP LOCKED.

CREATE OR REPLACE FUNCTION public.claim_push_notifications(batch_size integer DEFAULT 50)
RETURNS SETOF public.push_notification_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM public.push_notification_queue
    WHERE processed = false
    ORDER BY created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.push_notification_queue q
  SET processed = true
  FROM cte
  WHERE q.id = cte.id
  RETURNING q.*;
END;
$$;