-- Enable required extensions for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create or replace the cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clean old diagnostic logs (older than 3 days)
  DELETE FROM public.webhook_diagnostics 
  WHERE received_at < NOW() - INTERVAL '3 days';
  
  -- Finalize stuck flow sessions (no interaction for 7+ days)
  UPDATE public.inbox_flow_sessions 
  SET status = 'completed'
  WHERE status = 'active' 
    AND last_interaction < NOW() - INTERVAL '7 days';
  
  -- Clean old failed webhook messages (older than 7 days)
  DELETE FROM public.webhook_failed_messages 
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;