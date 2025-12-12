-- Create table for video creative analyses
CREATE TABLE public.video_creative_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  video_url TEXT NOT NULL,
  video_name TEXT NOT NULL,
  hook_score INTEGER NOT NULL,
  body_score INTEGER NOT NULL,
  cta_score INTEGER NOT NULL,
  coherence_score INTEGER NOT NULL,
  overall_score INTEGER NOT NULL,
  hook_analysis TEXT NOT NULL,
  body_analysis TEXT NOT NULL,
  cta_analysis TEXT NOT NULL,
  coherence_analysis TEXT NOT NULL,
  overall_analysis TEXT NOT NULL,
  transcription TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.video_creative_analyses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own analyses"
ON public.video_creative_analyses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analyses"
ON public.video_creative_analyses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyses"
ON public.video_creative_analyses
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_video_analyses_user_url ON public.video_creative_analyses(user_id, video_url);