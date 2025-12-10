-- Add image_url column to zap_spy_offers for offer preview images
ALTER TABLE public.zap_spy_offers 
ADD COLUMN image_url text;