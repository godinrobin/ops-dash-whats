-- Add conversion_value column to ads_campaigns
ALTER TABLE public.ads_campaigns 
ADD COLUMN IF NOT EXISTS conversion_value numeric DEFAULT 0;