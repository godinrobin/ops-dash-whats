-- Add column to track if the metric is from an invalid link
ALTER TABLE public.offer_metrics 
ADD COLUMN is_invalid_link boolean NOT NULL DEFAULT false;

-- Add index for better query performance
CREATE INDEX idx_offer_metrics_invalid_link ON public.offer_metrics(offer_id, is_invalid_link);