-- Add global status monitor flag to admin_notify_configs
ALTER TABLE public.admin_notify_configs 
ADD COLUMN IF NOT EXISTS status_monitor_enabled boolean DEFAULT false;