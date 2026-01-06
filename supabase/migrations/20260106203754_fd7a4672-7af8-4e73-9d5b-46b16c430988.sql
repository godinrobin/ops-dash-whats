-- Add uazapi_folder_id column to blaster_campaigns for tracking UAZAPI native campaigns
ALTER TABLE public.blaster_campaigns 
ADD COLUMN IF NOT EXISTS uazapi_folder_id TEXT;