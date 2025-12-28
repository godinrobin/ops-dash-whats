-- Add RLS policies for admins to view all ad data

-- ads_campaigns - Admin can view all
CREATE POLICY "Admins can view all campaigns" 
ON public.ads_campaigns FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- ads_adsets - Admin can view all
CREATE POLICY "Admins can view all adsets" 
ON public.ads_adsets FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- ads_ads - Admin can view all
CREATE POLICY "Admins can view all ads" 
ON public.ads_ads FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- ads_ad_accounts - Admin can view all
CREATE POLICY "Admins can view all ad accounts" 
ON public.ads_ad_accounts FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));