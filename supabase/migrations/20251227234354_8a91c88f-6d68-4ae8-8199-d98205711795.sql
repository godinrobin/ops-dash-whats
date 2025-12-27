-- Create ads_adsets table for ad set level data
CREATE TABLE public.ads_adsets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ad_account_id UUID REFERENCES public.ads_ad_accounts(id) ON DELETE CASCADE,
  adset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  daily_budget NUMERIC,
  lifetime_budget NUMERIC,
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cpm NUMERIC DEFAULT 0,
  cpc NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  cost_per_result NUMERIC DEFAULT 0,
  results INTEGER DEFAULT 0,
  cost_per_message NUMERIC DEFAULT 0,
  messaging_conversations_started INTEGER DEFAULT 0,
  meta_conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ads_ads table for ad level data
CREATE TABLE public.ads_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ad_account_id UUID REFERENCES public.ads_ad_accounts(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  creative_id TEXT,
  thumbnail_url TEXT,
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cpm NUMERIC DEFAULT 0,
  cpc NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  cost_per_result NUMERIC DEFAULT 0,
  results INTEGER DEFAULT 0,
  cost_per_message NUMERIC DEFAULT 0,
  messaging_conversations_started INTEGER DEFAULT 0,
  meta_conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.ads_adsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_ads ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ads_adsets
CREATE POLICY "Users can manage their own adsets"
ON public.ads_adsets
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for ads_ads
CREATE POLICY "Users can manage their own ads"
ON public.ads_ads
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_ads_adsets_user_id ON public.ads_adsets(user_id);
CREATE INDEX idx_ads_adsets_campaign_id ON public.ads_adsets(campaign_id);
CREATE INDEX idx_ads_adsets_adset_id ON public.ads_adsets(adset_id);
CREATE INDEX idx_ads_ads_user_id ON public.ads_ads(user_id);
CREATE INDEX idx_ads_ads_adset_id ON public.ads_ads(adset_id);
CREATE INDEX idx_ads_ads_campaign_id ON public.ads_ads(campaign_id);
CREATE INDEX idx_ads_ads_ad_id ON public.ads_ads(ad_id);