-- Remove the unique constraint on user_id that prevents multiple webhooks per user
ALTER TABLE public.logzz_webhooks DROP CONSTRAINT IF EXISTS logzz_webhooks_user_id_key;