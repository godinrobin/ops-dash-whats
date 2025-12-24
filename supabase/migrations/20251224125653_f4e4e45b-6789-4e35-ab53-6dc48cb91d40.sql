-- Create webhook_history table for logging and auditing
CREATE TABLE public.webhook_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text UNIQUE,
  email text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'received',
  error_message text,
  user_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_history ENABLE ROW LEVEL SECURITY;

-- Only admins can view webhook history
CREATE POLICY "Admins can view webhook history"
ON public.webhook_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage webhook history (for edge functions)
CREATE POLICY "Service role can manage webhook history"
ON public.webhook_history
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_webhook_history_transaction_id ON public.webhook_history(transaction_id);
CREATE INDEX idx_webhook_history_email ON public.webhook_history(email);
CREATE INDEX idx_webhook_history_created_at ON public.webhook_history(created_at DESC);