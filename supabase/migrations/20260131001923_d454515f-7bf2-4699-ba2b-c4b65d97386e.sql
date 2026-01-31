-- Allow authenticated users to SELECT their own logzz_webhook_events
CREATE POLICY "Users can view own logzz events"
ON public.logzz_webhook_events
FOR SELECT
USING (auth.uid() = user_id);