-- Create table to store failed/discarded webhook messages for debugging
CREATE TABLE public.webhook_failed_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  discard_reason TEXT NOT NULL,
  payload JSONB NOT NULL,
  phone_extracted TEXT,
  remote_jid TEXT,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_failed_messages ENABLE ROW LEVEL SECURITY;

-- Only admins can view failed messages
CREATE POLICY "Admins can view failed messages" 
ON public.webhook_failed_messages 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow service role to insert (from edge functions)
CREATE POLICY "Service role can insert failed messages" 
ON public.webhook_failed_messages 
FOR INSERT 
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_webhook_failed_messages_created_at ON public.webhook_failed_messages(created_at DESC);
CREATE INDEX idx_webhook_failed_messages_instance ON public.webhook_failed_messages(instance_name);

-- Add comment
COMMENT ON TABLE public.webhook_failed_messages IS 'Stores webhook messages that failed to process for debugging purposes';