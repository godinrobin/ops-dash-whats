-- Add page_id column to user_facebook_pixels for Business Messaging support
ALTER TABLE public.user_facebook_pixels ADD COLUMN IF NOT EXISTS page_id TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN public.user_facebook_pixels.page_id IS 'Facebook Page ID required for Conversions API for Business Messaging';