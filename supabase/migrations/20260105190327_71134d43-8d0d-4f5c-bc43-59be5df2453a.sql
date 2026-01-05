-- Fix function search path security warning
CREATE OR REPLACE FUNCTION public.update_tag_whats_notification_timestamp()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;