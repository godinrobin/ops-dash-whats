-- Add ad_account_id column to ads_whatsapp_leads to track which ad account originated each lead
ALTER TABLE public.ads_whatsapp_leads 
ADD COLUMN ad_account_id uuid REFERENCES public.ads_ad_accounts(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_ads_whatsapp_leads_ad_account_id ON public.ads_whatsapp_leads(ad_account_id);

-- Add comment explaining the purpose
COMMENT ON COLUMN public.ads_whatsapp_leads.ad_account_id IS 'References the ad account that originated this lead, used for conversion tracking';