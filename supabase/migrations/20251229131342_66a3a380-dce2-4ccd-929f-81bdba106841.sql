-- Corrigir o trigger prevent_self_member_promotion para permitir webhooks (service_role)
CREATE OR REPLACE FUNCTION public.prevent_self_member_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Permitir se está sendo executado pelo service_role (webhooks/Edge Functions)
  -- auth.uid() retorna NULL quando chamado pelo service_role
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se não é admin e está tentando mudar is_full_member de false para true
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.is_full_member = true AND (OLD.is_full_member IS NULL OR OLD.is_full_member = false) THEN
      RAISE EXCEPTION 'Only admins can promote users to full member';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;