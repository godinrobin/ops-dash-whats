-- Update disconnect notification trigger to call edge function via pg_net

CREATE OR REPLACE FUNCTION public.notify_admin_on_disconnect()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT;
  request_id BIGINT;
BEGIN
  -- Trigger when status changes to 'disconnected' (from anything else)
  IF NEW.status = 'disconnected'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status IS DISTINCT FROM 'disconnected' THEN

    -- Build the edge function URL
    edge_function_url := 'https://dcjizoulbggsavizbukq.supabase.co/functions/v1/admin-notify-disconnect';

    -- Call the edge function via pg_net
    request_id := net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'instance_id', NEW.id,
        'instance_name', NEW.instance_name,
        'phone_number', NEW.phone_number,
        'user_id', NEW.user_id
      )
    );

    RAISE LOG '[STATUS-MONITOR] Triggered disconnect notification for instance % (request_id: %)', NEW.instance_name, request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_notify_admin_on_disconnect ON public.maturador_instances;
CREATE TRIGGER trigger_notify_admin_on_disconnect
  AFTER UPDATE ON public.maturador_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_disconnect();
