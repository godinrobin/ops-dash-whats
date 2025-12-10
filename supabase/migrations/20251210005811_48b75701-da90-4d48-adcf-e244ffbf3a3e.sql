-- Add is_featured column to zap_spy_offers for "OFERTA FODA" badge
ALTER TABLE public.zap_spy_offers 
ADD COLUMN is_featured boolean NOT NULL DEFAULT false;

-- Add funnel_number column to tracked_offers
ALTER TABLE public.tracked_offers 
ADD COLUMN funnel_number text;