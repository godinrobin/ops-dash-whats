-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view their own offers" ON public.tracked_offers;

-- Create a simpler, non-recursive policy for SELECT
CREATE POLICY "Users can view their own offers" 
ON public.tracked_offers 
FOR SELECT 
USING (auth.uid() = user_id);