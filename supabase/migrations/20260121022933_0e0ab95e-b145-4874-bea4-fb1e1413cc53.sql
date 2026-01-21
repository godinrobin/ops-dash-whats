-- Add ad_post_url column to ads_ads table for URL matching
-- This will store the public URL of the ad post (derived from effective_object_story_id)
ALTER TABLE public.ads_ads 
ADD COLUMN IF NOT EXISTS ad_post_url TEXT;

-- Create an index for faster lookups by ad_post_url
CREATE INDEX IF NOT EXISTS idx_ads_ads_ad_post_url ON public.ads_ads(ad_post_url) WHERE ad_post_url IS NOT NULL;

-- Also add effective_object_story_id column to store the raw ID
ALTER TABLE public.ads_ads 
ADD COLUMN IF NOT EXISTS effective_object_story_id TEXT;

COMMENT ON COLUMN public.ads_ads.ad_post_url IS 'Public URL of the ad post (e.g., facebook.com/pageId/posts/postId)';
COMMENT ON COLUMN public.ads_ads.effective_object_story_id IS 'Raw effective_object_story_id from Facebook API (format: pageId_postId)';