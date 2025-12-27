-- Add unique constraint on (flow_id, contact_id) for inbox_flow_sessions
-- This allows the webhook to use upsert with onConflict
ALTER TABLE public.inbox_flow_sessions 
ADD CONSTRAINT inbox_flow_sessions_flow_contact_unique 
UNIQUE (flow_id, contact_id);