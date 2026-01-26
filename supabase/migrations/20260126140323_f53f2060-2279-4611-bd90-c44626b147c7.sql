-- Add DELETE policy for logzz_webhooks table
CREATE POLICY "Users can delete own webhooks" 
ON public.logzz_webhooks 
FOR DELETE 
USING (auth.uid() = user_id);