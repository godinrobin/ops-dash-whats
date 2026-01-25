-- Add kanban_column_order column to profiles table for persisting Kanban column order
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS kanban_column_order text[] DEFAULT NULL;

-- Add trigger_tags column to inbox_flows table for tag-based flow triggers
ALTER TABLE public.inbox_flows 
ADD COLUMN IF NOT EXISTS trigger_tags text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.kanban_column_order IS 'Stores the user custom order of Kanban columns';
COMMENT ON COLUMN public.inbox_flows.trigger_tags IS 'Tags that trigger this flow when added to a contact (for trigger_type=tag)';