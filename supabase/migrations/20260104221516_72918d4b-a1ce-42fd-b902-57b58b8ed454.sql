-- Allow admins to view all tag_whats_logs
CREATE POLICY "Admins can view all tag_whats_logs"
ON public.tag_whats_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));