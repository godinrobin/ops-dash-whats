-- Facebook Accounts connected by users
CREATE TABLE public.ads_facebook_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  facebook_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  name TEXT,
  email TEXT,
  profile_pic_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, facebook_user_id)
);

-- Ad accounts the user has access to
CREATE TABLE public.ads_ad_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  facebook_account_id UUID REFERENCES public.ads_facebook_accounts(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  name TEXT,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  account_status INTEGER,
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, ad_account_id)
);

-- Cached campaigns data
CREATE TABLE public.ads_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ad_account_id UUID REFERENCES public.ads_ad_accounts(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  objective TEXT,
  daily_budget NUMERIC,
  lifetime_budget NUMERIC,
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  results INTEGER DEFAULT 0,
  cost_per_result NUMERIC DEFAULT 0,
  cpm NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, campaign_id)
);

-- User's WhatsApp numbers for tracking
CREATE TABLE public.ads_whatsapp_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

-- WhatsApp leads/contacts tracked
CREATE TABLE public.ads_whatsapp_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  whatsapp_number_id UUID REFERENCES public.ads_whatsapp_numbers(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  name TEXT,
  profile_pic_url TEXT,
  fbclid TEXT,
  ctwa_clid TEXT,
  ad_id TEXT,
  campaign_id TEXT,
  adset_id TEXT,
  first_message TEXT,
  first_contact_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  purchase_sent_at TIMESTAMP WITH TIME ZONE,
  purchase_value NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Alert numbers for notifications
CREATE TABLE public.ads_alert_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

-- Alert history
CREATE TABLE public.ads_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL, -- 'ad_rejected', 'account_restricted', 'payment_failed', 'number_down'
  title TEXT NOT NULL,
  message TEXT,
  ad_account_id TEXT,
  campaign_id TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ads_facebook_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_whatsapp_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_alert_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ads_facebook_accounts
CREATE POLICY "Users can manage their own facebook accounts" ON public.ads_facebook_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ads_ad_accounts
CREATE POLICY "Users can manage their own ad accounts" ON public.ads_ad_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ads_campaigns
CREATE POLICY "Users can manage their own campaigns" ON public.ads_campaigns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ads_whatsapp_numbers
CREATE POLICY "Users can manage their own whatsapp numbers" ON public.ads_whatsapp_numbers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ads_whatsapp_leads
CREATE POLICY "Users can manage their own leads" ON public.ads_whatsapp_leads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ads_alert_numbers
CREATE POLICY "Users can manage their own alert numbers" ON public.ads_alert_numbers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ads_alerts
CREATE POLICY "Users can manage their own alerts" ON public.ads_alerts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enable realtime for leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_whatsapp_leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_alerts;

-- Trigger for updated_at
CREATE TRIGGER update_ads_facebook_accounts_updated_at BEFORE UPDATE ON public.ads_facebook_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_ad_accounts_updated_at BEFORE UPDATE ON public.ads_ad_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_campaigns_updated_at BEFORE UPDATE ON public.ads_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_whatsapp_numbers_updated_at BEFORE UPDATE ON public.ads_whatsapp_numbers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_whatsapp_leads_updated_at BEFORE UPDATE ON public.ads_whatsapp_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();