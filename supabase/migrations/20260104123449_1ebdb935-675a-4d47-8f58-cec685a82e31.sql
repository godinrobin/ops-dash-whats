-- Create table to store pixels for each ad account
CREATE TABLE IF NOT EXISTS public.ads_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ad_account_id UUID NOT NULL REFERENCES public.ads_ad_accounts(id) ON DELETE CASCADE,
  pixel_id TEXT NOT NULL,
  name TEXT,
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, pixel_id)
);

-- Enable RLS
ALTER TABLE public.ads_pixels ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own pixels" 
ON public.ads_pixels 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pixels" 
ON public.ads_pixels 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pixels" 
ON public.ads_pixels 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pixels" 
ON public.ads_pixels 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ads_pixels_updated_at
BEFORE UPDATE ON public.ads_pixels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add pixel_id column to tag_whats_configs if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tag_whats_configs' AND column_name = 'pixel_id') THEN
    ALTER TABLE public.tag_whats_configs ADD COLUMN pixel_id UUID REFERENCES public.ads_pixels(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add selected_ad_account_ids array column to tag_whats_configs for multi-select
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tag_whats_configs' AND column_name = 'selected_ad_account_ids') THEN
    ALTER TABLE public.tag_whats_configs ADD COLUMN selected_ad_account_ids UUID[] DEFAULT '{}';
  END IF;
END $$;