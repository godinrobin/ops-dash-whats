-- Add policy for admins to insert verified contacts
CREATE POLICY "Admins can insert verified contacts"
ON public.maturador_verified_contacts
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add policy for admins to update verified contacts
CREATE POLICY "Admins can update verified contacts"
ON public.maturador_verified_contacts
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Add policy for admins to delete verified contacts
CREATE POLICY "Admins can delete verified contacts"
ON public.maturador_verified_contacts
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));