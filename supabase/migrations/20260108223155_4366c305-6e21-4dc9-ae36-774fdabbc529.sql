-- Fix disconnect notification trigger to handle null phone numbers and more status transitions

CREATE OR REPLACE FUNCTION public.notify_admin_on_disconnect()
RETURNS TRIGGER AS $$
DECLARE
  config_record RECORD;
  notifier_record RECORD;
  admin_phone TEXT;
  admin_phone_digits TEXT;
  message TEXT;
  request_id BIGINT;
BEGIN
  -- Trigger when status changes to 'disconnected' (from anything else)
  IF NEW.status = 'disconnected'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status IS DISTINCT FROM 'disconnected' THEN

    -- Check if user has global status monitoring enabled
    SELECT * INTO config_record
    FROM public.admin_notify_configs
    WHERE user_id = NEW.user_id
      AND status_monitor_enabled = true
    LIMIT 1;

    IF FOUND
       AND config_record.notifier_instance_id IS NOT NULL
       AND config_record.admin_instance_ids IS NOT NULL
       AND array_length(config_record.admin_instance_ids, 1) > 0 THEN

      -- Get notifier instance details
      SELECT instance_name, uazapi_token INTO notifier_record
      FROM public.maturador_instances
      WHERE id = config_record.notifier_instance_id;

      IF notifier_record.uazapi_token IS NOT NULL THEN
        -- Send notification to each admin phone (fallback to instance_name if phone_number is null)
        FOR admin_phone IN
          SELECT COALESCE(phone_number, instance_name)
          FROM public.maturador_instances
          WHERE id = ANY(config_record.admin_instance_ids)
            AND COALESCE(phone_number, instance_name) IS NOT NULL
        LOOP
          admin_phone_digits := regexp_replace(admin_phone, '\\D', '', 'g');

          -- Skip if we can't extract any digits
          IF admin_phone_digits IS NULL OR admin_phone_digits = '' THEN
            CONTINUE;
          END IF;

          message := format(
            '🚨 Número Caiu: %s\n\n```aviso zapdata```',
            COALESCE(NULLIF(NEW.phone_number, ''), NEW.instance_name)
          );

          request_id := net.http_post(
            url := format('https://api.uazapi.com/message/text/%s', notifier_record.instance_name),
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', format('Bearer %s', notifier_record.uazapi_token)
            ),
            body := jsonb_build_object(
              'to', format('%s@s.whatsapp.net', admin_phone_digits),
              'text', message
            )
          );
        END LOOP;
      END IF;
    END IF;
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
