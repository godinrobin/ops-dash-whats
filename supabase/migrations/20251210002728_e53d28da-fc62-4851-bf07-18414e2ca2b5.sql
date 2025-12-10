-- Add new columns to zap_spy_offers for active ads count and start date
ALTER TABLE public.zap_spy_offers 
ADD COLUMN IF NOT EXISTS active_ads_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS start_date date;

-- Change niche column from enum to text to allow custom niches
ALTER TABLE public.zap_spy_offers 
ALTER COLUMN niche TYPE text USING niche::text;

-- Drop the enum type since we're using text now
DROP TYPE IF EXISTS public.offer_niche;

-- Add favorite users table for admin
CREATE TABLE IF NOT EXISTS public.admin_favorite_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS on admin_favorite_users
ALTER TABLE public.admin_favorite_users ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_favorite_users
CREATE POLICY "Admins can view favorite users"
ON public.admin_favorite_users
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert favorite users"
ON public.admin_favorite_users
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete favorite users"
ON public.admin_favorite_users
FOR DELETE
USING (has_role(auth.uid(), 'admin'));