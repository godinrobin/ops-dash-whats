-- Add csv_variables column to blaster_campaigns for CSV variable substitution
ALTER TABLE public.blaster_campaigns 
ADD COLUMN IF NOT EXISTS csv_variables jsonb DEFAULT NULL;