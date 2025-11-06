-- Create a view that shows metrics with product names
CREATE OR REPLACE VIEW metrics_with_product AS
SELECT 
  m.id,
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
  m.product_id,
  p.name as product_name,
  p.user_id,
  m.created_at
FROM metrics m
INNER JOIN products p ON m.product_id = p.id;

-- Enable RLS on the view
ALTER VIEW metrics_with_product SET (security_invoker = true);