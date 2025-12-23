-- Robust long-delay queue for inbox flows

-- Ensure scheduling extensions exist (already used elsewhere, but keep idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- One scheduled job per flow session (a session can only be in one delay at a time)
CREATE TABLE IF NOT EXISTS public.inbox_flow_delay_jobs (
  session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | processing | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_flow_delay_jobs_status_run_at_idx
  ON public.inbox_flow_delay_jobs (status, run_at);

ALTER TABLE public.inbox_flow_delay_jobs ENABLE ROW LEVEL SECURITY;

-- Update updated_at automatically
DROP TRIGGER IF EXISTS update_inbox_flow_delay_jobs_updated_at ON public.inbox_flow_delay_jobs;
CREATE TRIGGER update_inbox_flow_delay_jobs_updated_at
BEFORE UPDATE ON public.inbox_flow_delay_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
