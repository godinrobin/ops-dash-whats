-- Remover política existente de admin para update
DROP POLICY IF EXISTS "Admins can update any offer admin_status" ON public.tracked_offers;

-- Criar nova política que permite admins atualizarem qualquer oferta
CREATE POLICY "Admins can update any offer"
ON public.tracked_offers
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));