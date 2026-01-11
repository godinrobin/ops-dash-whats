-- Allow authenticated users to read profiles so the Feed can show author name/avatar
-- (current policy only allows viewing own profile, which breaks feed for other users)
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);