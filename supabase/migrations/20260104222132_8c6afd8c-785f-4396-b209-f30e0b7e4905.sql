-- Allow admins to view products of any user (needed for impersonation)
-- This policy works together with explicit user_id filtering in the application
CREATE POLICY "Admins can view all products for impersonation"
ON public.products
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));