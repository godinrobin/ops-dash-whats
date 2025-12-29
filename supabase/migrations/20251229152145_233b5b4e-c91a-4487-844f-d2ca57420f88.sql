-- Create webhook diagnostics table for internal debugging
CREATE TABLE IF NOT EXISTS public.webhook_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  payload_preview TEXT,
  user_id UUID
);

-- Create index for fast lookups
CREATE INDEX idx_webhook_diag_instance ON public.webhook_diagnostics(instance_name, received_at DESC);
CREATE INDEX idx_webhook_diag_user ON public.webhook_diagnostics(user_id, received_at DESC);

-- Enable RLS
ALTER TABLE public.webhook_diagnostics ENABLE ROW LEVEL SECURITY;

-- Only admins can view diagnostics
CREATE POLICY "Admins can view webhook diagnostics" 
ON public.webhook_diagnostics 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- System can insert diagnostics (via service role)
CREATE POLICY "System can insert webhook diagnostics" 
ON public.webhook_diagnostics 
FOR INSERT 
WITH CHECK (true);

-- Auto-cleanup old diagnostics (keep last 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_diagnostics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.webhook_diagnostics 
  WHERE received_at < now() - interval '7 days';
END;
$$;