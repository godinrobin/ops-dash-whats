-- Add admin policy for inbox_tags to allow admins to view impersonated user's tags
CREATE POLICY "Admins can manage all inbox tags"
ON public.inbox_tags
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));