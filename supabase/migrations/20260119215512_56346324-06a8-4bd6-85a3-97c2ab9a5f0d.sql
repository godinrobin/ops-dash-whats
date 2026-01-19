-- Drop the old check constraint and recreate with mobile included
ALTER TABLE public.proxy_orders DROP CONSTRAINT proxy_orders_plan_type_check;

ALTER TABLE public.proxy_orders 
ADD CONSTRAINT proxy_orders_plan_type_check 
CHECK (plan_type = ANY (ARRAY['residential'::text, 'mobile'::text, 'isp'::text, 'datacenter'::text]));