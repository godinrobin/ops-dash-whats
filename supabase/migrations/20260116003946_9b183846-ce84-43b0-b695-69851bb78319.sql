-- Add charge-related columns to tag_whats_configs table
ALTER TABLE public.tag_whats_configs 
ADD COLUMN IF NOT EXISTS auto_charge_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS charge_amount numeric,
ADD COLUMN IF NOT EXISTS charge_item_name text,
ADD COLUMN IF NOT EXISTS charge_description text,
ADD COLUMN IF NOT EXISTS charge_pix_type text DEFAULT 'EVP',
ADD COLUMN IF NOT EXISTS charge_pix_key text,
ADD COLUMN IF NOT EXISTS charge_pix_name text,
ADD COLUMN IF NOT EXISTS disable_label_on_charge boolean DEFAULT false;