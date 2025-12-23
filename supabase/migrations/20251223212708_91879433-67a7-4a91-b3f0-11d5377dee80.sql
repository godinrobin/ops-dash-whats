-- Add processing lock columns to inbox_flow_sessions
ALTER TABLE public.inbox_flow_sessions
ADD COLUMN IF NOT EXISTS processing boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Create partial unique index to prevent duplicate active sessions per flow+contact
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_flow_sessions_unique_active 
ON public.inbox_flow_sessions (flow_id, contact_id) 
WHERE status = 'active';