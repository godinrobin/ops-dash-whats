-- Persist subtitle info for generated videos
ALTER TABLE public.video_generation_jobs
  ADD COLUMN IF NOT EXISTS is_subtitled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_video_url text,
  ADD COLUMN IF NOT EXISTS subtitled_video_url text;

-- Backfill original video URL for existing rows
UPDATE public.video_generation_jobs
SET original_video_url = COALESCE(original_video_url, video_url)
WHERE original_video_url IS NULL;
