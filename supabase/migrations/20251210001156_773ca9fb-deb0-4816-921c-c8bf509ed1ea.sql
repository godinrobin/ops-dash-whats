-- Create niches enum for Zap Spy
CREATE TYPE public.offer_niche AS ENUM (
  'emagrecimento',
  'renda_extra',
  'relacionamento',
  'saude',
  'beleza',
  'educacao',
  'financeiro',
  'religioso',
  'pets',
  'outros'
);

-- Create status enum for admin offer tracking
CREATE TYPE public.admin_offer_status AS ENUM ('minerada', 'ruim', 'boa');

-- Add admin_status column to tracked_offers for admin tracking
ALTER TABLE public.tracked_offers 
ADD COLUMN admin_status public.admin_offer_status DEFAULT NULL;

-- Create Zap Spy offers table (admin-managed offers for all users to see)
CREATE TABLE public.zap_spy_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  ad_library_link TEXT NOT NULL,
  niche public.offer_niche NOT NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on zap_spy_offers
ALTER TABLE public.zap_spy_offers ENABLE ROW LEVEL SECURITY;

-- Everyone can view non-hidden offers
CREATE POLICY "Anyone can view non-hidden zap spy offers"
ON public.zap_spy_offers
FOR SELECT
USING (is_hidden = false OR has_role(auth.uid(), 'admin'));

-- Only admins can insert offers
CREATE POLICY "Admins can insert zap spy offers"
ON public.zap_spy_offers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Only admins can update offers
CREATE POLICY "Admins can update zap spy offers"
ON public.zap_spy_offers
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- Only admins can delete offers
CREATE POLICY "Admins can delete zap spy offers"
ON public.zap_spy_offers
FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create admin user rankings table
CREATE TABLE public.admin_user_rankings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  ranking INTEGER DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on admin_user_rankings
ALTER TABLE public.admin_user_rankings ENABLE ROW LEVEL SECURITY;

-- Only admins can view rankings
CREATE POLICY "Admins can view user rankings"
ON public.admin_user_rankings
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Only admins can manage rankings
CREATE POLICY "Admins can insert user rankings"
ON public.admin_user_rankings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update user rankings"
ON public.admin_user_rankings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete user rankings"
ON public.admin_user_rankings
FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Add policy for admins to update tracked_offers admin_status
CREATE POLICY "Admins can update any offer admin_status"
ON public.tracked_offers
FOR UPDATE
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));