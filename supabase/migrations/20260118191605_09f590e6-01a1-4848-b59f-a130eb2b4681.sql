-- Add columns to profiles for label toggle and FB event settings
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS disable_pago_label BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS fb_auto_event_type TEXT DEFAULT 'Purchase';

-- Add columns to tag_whats_logs for FB event status tracking
ALTER TABLE public.tag_whats_logs
ADD COLUMN IF NOT EXISTS fb_event_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS fb_event_pixel_id TEXT,
ADD COLUMN IF NOT EXISTS fb_event_error TEXT;

-- Create index for faster queries on fb_event_status
CREATE INDEX IF NOT EXISTS idx_tag_whats_logs_fb_event_status ON public.tag_whats_logs(fb_event_status);