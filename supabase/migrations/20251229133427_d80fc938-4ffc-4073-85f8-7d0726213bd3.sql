-- Create table for logging ad lead ingest events (skips, errors, debug info)
CREATE TABLE public.ads_lead_ingest_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  phone_prefix TEXT,
  remote_jid TEXT,
  phone_source TEXT,
  ctwa_source TEXT,
  payload_hash TEXT,
  payload_snippet JSONB,
  event_type TEXT DEFAULT 'skip',
  resolved BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.ads_lead_ingest_logs ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own logs
CREATE POLICY "Users can view their own ingest logs"
ON public.ads_lead_ingest_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Allow admins to view all logs
CREATE POLICY "Admins can view all ingest logs"
ON public.ads_lead_ingest_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow service role to insert (from edge function)
-- No INSERT policy for regular users - only edge functions with service role can insert

-- Create index for faster queries
CREATE INDEX idx_ads_lead_ingest_logs_user ON public.ads_lead_ingest_logs(user_id, created_at DESC);
CREATE INDEX idx_ads_lead_ingest_logs_instance ON public.ads_lead_ingest_logs(instance_id, created_at DESC);

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_lead_ingest_logs;