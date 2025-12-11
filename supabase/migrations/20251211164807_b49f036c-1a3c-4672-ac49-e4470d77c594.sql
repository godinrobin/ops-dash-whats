-- Adicionar política SELECT para admins verem todas as ofertas
CREATE POLICY "Admins can view all offers"
ON public.tracked_offers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));