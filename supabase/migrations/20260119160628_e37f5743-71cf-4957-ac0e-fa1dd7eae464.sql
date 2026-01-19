-- Add keyword_match_type column to inbox_flows table
-- Values: 'exact' (exact match), 'contains' (contains the keyword), 'not_contains' (does not contain)
ALTER TABLE public.inbox_flows 
ADD COLUMN IF NOT EXISTS keyword_match_type TEXT DEFAULT 'contains';

-- Set all existing flows to 'exact' as requested by user
UPDATE public.inbox_flows 
SET keyword_match_type = 'exact' 
WHERE keyword_match_type IS NULL OR keyword_match_type = 'contains';

-- Add comment for documentation
COMMENT ON COLUMN public.inbox_flows.keyword_match_type IS 'Type of keyword matching: exact, contains, or not_contains';