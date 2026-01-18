-- Create table for user Facebook pixels (multiple per user)
CREATE TABLE public.user_facebook_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pixel_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_facebook_pixels ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own pixels" 
ON public.user_facebook_pixels 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own pixels" 
ON public.user_facebook_pixels 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pixels" 
ON public.user_facebook_pixels 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pixels" 
ON public.user_facebook_pixels 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_facebook_pixels_updated_at
BEFORE UPDATE ON public.user_facebook_pixels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to profiles table for Facebook event settings
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fb_event_on_sale TEXT DEFAULT 'Purchase';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fb_event_enabled BOOLEAN DEFAULT false;