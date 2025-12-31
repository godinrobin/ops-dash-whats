-- Add UazAPI detected configuration fields
ALTER TABLE public.whatsapp_api_config
ADD COLUMN IF NOT EXISTS uazapi_api_prefix text DEFAULT '',
ADD COLUMN IF NOT EXISTS uazapi_admin_header text DEFAULT 'admintoken',
ADD COLUMN IF NOT EXISTS uazapi_list_instances_path text DEFAULT '/admin/listInstances',
ADD COLUMN IF NOT EXISTS uazapi_list_instances_method text DEFAULT 'GET';