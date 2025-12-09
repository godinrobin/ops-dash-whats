-- Create table for saved funnels
CREATE TABLE public.saved_funnels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  funnel_content JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_funnels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own funnels" 
ON public.saved_funnels 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own funnels" 
ON public.saved_funnels 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own funnels" 
ON public.saved_funnels 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own funnels" 
ON public.saved_funnels 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add notes column to tracked_offers
ALTER TABLE public.tracked_offers ADD COLUMN IF NOT EXISTS notes TEXT;