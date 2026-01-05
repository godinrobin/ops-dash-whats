-- Add pause schedule columns to inbox_flows
ALTER TABLE public.inbox_flows 
ADD COLUMN IF NOT EXISTS pause_schedule_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pause_schedule_start time,
ADD COLUMN IF NOT EXISTS pause_schedule_end time;

-- Add comment for documentation
COMMENT ON COLUMN public.inbox_flows.pause_schedule_enabled IS 'Enable pause schedule for this flow';
COMMENT ON COLUMN public.inbox_flows.pause_schedule_start IS 'Start time for pause schedule (São Paulo timezone)';
COMMENT ON COLUMN public.inbox_flows.pause_schedule_end IS 'End time for pause schedule (São Paulo timezone)';