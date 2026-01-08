-- Create a function to send disconnect notification
CREATE OR REPLACE FUNCTION public.notify_admin_on_disconnect()
RETURNS TRIGGER AS $$
DECLARE
  config_record RECORD;
  notifier_record RECORD;
  admin_phone TEXT;
  message TEXT;
BEGIN
  -- Only trigger when status changes from 'connected' to 'disconnected'
  IF OLD.status = 'connected' AND NEW.status = 'disconnected' THEN
    -- Check if user has global status monitoring enabled
    SELECT * INTO config_record
    FROM public.admin_notify_configs
    WHERE user_id = NEW.user_id
      AND status_monitor_enabled = true
    LIMIT 1;

    IF FOUND AND config_record.notifier_instance_id IS NOT NULL 
       AND config_record.admin_instance_ids IS NOT NULL 
       AND array_length(config_record.admin_instance_ids, 1) > 0 THEN
      
      -- Get notifier instance details
      SELECT instance_name, uazapi_token INTO notifier_record
      FROM public.maturador_instances
      WHERE id = config_record.notifier_instance_id;

      IF notifier_record.uazapi_token IS NOT NULL THEN
        -- Get admin phone numbers and send notification via pg_net
        FOR admin_phone IN
          SELECT phone_number 
          FROM public.maturador_instances 
          WHERE id = ANY(config_record.admin_instance_ids)
            AND phone_number IS NOT NULL
        LOOP
          message := format(
            '🚨 Número Caiu: %s

```aviso zapdata```',
            COALESCE(NEW.phone_number, NEW.instance_name)
          );
          
          -- Use pg_net to send HTTP request to UazAPI
          PERFORM net.http_post(
            url := format('https://api.uazapi.com/message/text/%s', notifier_record.instance_name),
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', format('Bearer %s', notifier_record.uazapi_token)
            ),
            body := jsonb_build_object(
              'to', format('%s@s.whatsapp.net', regexp_replace(admin_phone, '\D', '', 'g')),
              'text', message
            )
          );
          
          RAISE LOG '[STATUS-MONITOR] Sent disconnect notification for % to %', NEW.instance_name, admin_phone;
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on maturador_instances
DROP TRIGGER IF EXISTS trigger_notify_admin_on_disconnect ON public.maturador_instances;
CREATE TRIGGER trigger_notify_admin_on_disconnect
  AFTER UPDATE ON public.maturador_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_disconnect();