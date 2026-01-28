-- Add video vturb fields to admin_announcements
ALTER TABLE public.admin_announcements
ADD COLUMN IF NOT EXISTS video_code TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS video_optimization_code TEXT DEFAULT NULL;