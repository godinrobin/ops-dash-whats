-- 1. Política UPDATE para user_roles (apenas admins podem modificar roles)
CREATE POLICY "Only admins can update roles" 
ON public.user_roles 
FOR UPDATE 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Forçar RLS mesmo para owner da tabela
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

-- 3. Tabela de auditoria para registrar mudanças em roles
CREATE TABLE IF NOT EXISTS public.admin_role_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target_user_id uuid NOT NULL,
  performed_by uuid,
  role_affected text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_role_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_audit_log FORCE ROW LEVEL SECURITY;

-- Apenas admins podem ver o log de auditoria
CREATE POLICY "Admins can view audit log"
ON public.admin_role_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Sistema pode inserir no log (via trigger)
CREATE POLICY "System can insert audit log"
ON public.admin_role_audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4. Trigger para auditar todas as mudanças em user_roles
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_role_audit_log (action, target_user_id, performed_by, role_affected)
    VALUES ('INSERT', NEW.user_id, auth.uid(), NEW.role::text);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_role_audit_log (action, target_user_id, performed_by, role_affected)
    VALUES ('DELETE', OLD.user_id, auth.uid(), OLD.role::text);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.admin_role_audit_log (action, target_user_id, performed_by, role_affected)
    VALUES ('UPDATE', NEW.user_id, auth.uid(), NEW.role::text);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.audit_role_changes();

-- 5. Trigger para impedir auto-promoção a membro completo
CREATE OR REPLACE FUNCTION public.prevent_self_member_promotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se não é admin e está tentando mudar is_full_member de false para true
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.is_full_member = true AND (OLD.is_full_member IS NULL OR OLD.is_full_member = false) THEN
      RAISE EXCEPTION 'Only admins can promote users to full member';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_member_promotion
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_member_promotion();