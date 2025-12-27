-- Add new metrics columns to ads_campaigns table
ALTER TABLE public.ads_campaigns 
ADD COLUMN IF NOT EXISTS reach integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cpc numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_per_message numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS messaging_conversations_started integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS meta_conversions integer DEFAULT 0;