-- Create storage bucket for video clips
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-clips', 'video-clips', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for video-clips bucket
CREATE POLICY "Users can upload their own video clips"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'video-clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own video clips"
ON storage.objects FOR SELECT
USING (bucket_id = 'video-clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own video clips"
ON storage.objects FOR DELETE
USING (bucket_id = 'video-clips' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create table to track video generation jobs
CREATE TABLE public.video_generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  render_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  video_url TEXT,
  variation_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.video_generation_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own jobs"
ON public.video_generation_jobs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
ON public.video_generation_jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
ON public.video_generation_jobs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs"
ON public.video_generation_jobs FOR DELETE
USING (auth.uid() = user_id);