-- Add ad source URL to ads_whatsapp_leads
ALTER TABLE public.ads_whatsapp_leads ADD COLUMN IF NOT EXISTS ad_source_url TEXT;

-- Add ad metadata columns to inbox_contacts
ALTER TABLE public.inbox_contacts 
  ADD COLUMN IF NOT EXISTS ad_source_url TEXT,
  ADD COLUMN IF NOT EXISTS ad_title TEXT,
  ADD COLUMN IF NOT EXISTS ad_body TEXT,
  ADD COLUMN IF NOT EXISTS ctwa_clid TEXT;