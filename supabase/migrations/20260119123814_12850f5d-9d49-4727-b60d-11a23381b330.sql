-- Add new columns to inbox_quick_replies for enhanced functionality
ALTER TABLE public.inbox_quick_replies 
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS assigned_instances TEXT[] DEFAULT '{}';

-- Create index for faster lookups by instance
CREATE INDEX IF NOT EXISTS idx_inbox_quick_replies_user_instances 
ON public.inbox_quick_replies USING GIN (assigned_instances);