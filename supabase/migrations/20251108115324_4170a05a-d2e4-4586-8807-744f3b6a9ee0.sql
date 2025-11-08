-- Drop and recreate the metrics_with_product view to ensure product name is visible
DROP VIEW IF EXISTS public.metrics_with_product CASCADE;

CREATE VIEW public.metrics_with_product AS
SELECT 
  m.id,
  m.product_id,
  p.name as product_name,
  m.date,
  m.structure,
  m.invested,
  m.leads,
  m.pix_count,
  m.pix_total,
  m.cpl,
  m.conversion,
  m.result,
  m.roas,
  m.created_at,
  p.user_id
FROM public.metrics m
LEFT JOIN public.products p ON m.product_id = p.id;