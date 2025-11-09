-- Create table to track daily update status
CREATE TABLE IF NOT EXISTS public.daily_update_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_running boolean NOT NULL DEFAULT false,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  total_offers integer DEFAULT 0,
  processed_offers integer DEFAULT 0,
  failed_offers integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS policies for daily_update_status
ALTER TABLE public.daily_update_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read update status"
ON public.daily_update_status
FOR SELECT
USING (true);

-- Only system can modify (through edge function)
CREATE POLICY "Service role can modify update status"
ON public.daily_update_status
FOR ALL
USING (auth.role() = 'service_role');