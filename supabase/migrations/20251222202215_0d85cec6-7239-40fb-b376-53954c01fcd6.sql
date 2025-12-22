-- Create table for cloned sites history
CREATE TABLE public.cloned_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  analysis_result JSONB NOT NULL,
  generated_prompt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cloned_sites ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own cloned sites"
ON public.cloned_sites
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cloned sites"
ON public.cloned_sites
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cloned sites"
ON public.cloned_sites
FOR DELETE
USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX idx_cloned_sites_user_id ON public.cloned_sites(user_id);
CREATE INDEX idx_cloned_sites_created_at ON public.cloned_sites(created_at DESC);

-- Add media support columns to blaster_campaigns
ALTER TABLE public.blaster_campaigns
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'text',
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS dispatches_per_instance INTEGER DEFAULT 1;