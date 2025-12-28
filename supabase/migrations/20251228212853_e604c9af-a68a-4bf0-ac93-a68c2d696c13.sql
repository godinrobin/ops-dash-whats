-- Add timeout_at column to inbox_flow_sessions
ALTER TABLE public.inbox_flow_sessions ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for efficient timeout queries
CREATE INDEX IF NOT EXISTS idx_inbox_flow_sessions_timeout_at ON public.inbox_flow_sessions(timeout_at) WHERE timeout_at IS NOT NULL;