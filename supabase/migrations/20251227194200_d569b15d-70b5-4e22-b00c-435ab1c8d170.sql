-- Remove the old unique index that prevents same phone on different instances
DROP INDEX IF EXISTS public.inbox_contacts_user_phone_unique;