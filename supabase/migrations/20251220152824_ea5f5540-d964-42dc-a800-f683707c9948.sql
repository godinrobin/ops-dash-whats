-- Create table for video prompts library
CREATE TABLE public.video_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  preview_url TEXT,
  preview_thumbnail TEXT,
  source TEXT NOT NULL DEFAULT 'community',
  tags TEXT[] DEFAULT '{}',
  ai_model TEXT DEFAULT 'sora',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  uses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.video_prompts ENABLE ROW LEVEL SECURITY;

-- Anyone can view non-hidden prompts
CREATE POLICY "Anyone can view non-hidden prompts"
ON public.video_prompts
FOR SELECT
USING (is_hidden = false OR has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all prompts
CREATE POLICY "Admins can insert prompts"
ON public.video_prompts
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update prompts"
ON public.video_prompts
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete prompts"
ON public.video_prompts
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for better search performance
CREATE INDEX idx_video_prompts_category ON public.video_prompts(category);
CREATE INDEX idx_video_prompts_ai_model ON public.video_prompts(ai_model);
CREATE INDEX idx_video_prompts_tags ON public.video_prompts USING GIN(tags);
CREATE INDEX idx_video_prompts_is_featured ON public.video_prompts(is_featured) WHERE is_featured = true;