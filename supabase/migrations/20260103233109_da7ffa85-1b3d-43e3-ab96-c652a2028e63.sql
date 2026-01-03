-- Add conversion tracking fields to tag_whats_configs
ALTER TABLE public.tag_whats_configs 
ADD COLUMN IF NOT EXISTS enable_conversion_tracking BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ad_account_id TEXT,
ADD COLUMN IF NOT EXISTS pixel_id TEXT;

-- Add conversion tracking fields to tag_whats_logs
ALTER TABLE public.tag_whats_logs
ADD COLUMN IF NOT EXISTS conversion_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS conversion_event_id TEXT,
ADD COLUMN IF NOT EXISTS conversion_error TEXT,
ADD COLUMN IF NOT EXISTS ctwa_clid TEXT,
ADD COLUMN IF NOT EXISTS extracted_value NUMERIC;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tag_whats_logs_conversion ON public.tag_whats_logs(conversion_sent) WHERE conversion_sent = true;