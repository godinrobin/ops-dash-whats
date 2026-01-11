-- Add column for sale notification preference
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notify_on_sale boolean DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.notify_on_sale IS 'Whether user wants push notifications for new sales';