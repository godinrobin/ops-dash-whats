-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  last_update TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create metrics table
CREATE TABLE public.metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  structure TEXT NOT NULL,
  invested DECIMAL(10, 2) NOT NULL,
  leads INTEGER NOT NULL,
  pix_count INTEGER NOT NULL,
  pix_total DECIMAL(10, 2) NOT NULL,
  cpl DECIMAL(10, 2) NOT NULL,
  conversion DECIMAL(5, 2) NOT NULL,
  result DECIMAL(10, 2) NOT NULL,
  roas DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
CREATE POLICY "Anyone can view products"
  ON public.products
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert products"
  ON public.products
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update products"
  ON public.products
  FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete products"
  ON public.products
  FOR DELETE
  USING (true);

CREATE POLICY "Anyone can view metrics"
  ON public.metrics
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert metrics"
  ON public.metrics
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update metrics"
  ON public.metrics
  FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete metrics"
  ON public.metrics
  FOR DELETE
  USING (true);

-- Create indexes for better performance
CREATE INDEX idx_metrics_product_id ON public.metrics(product_id);
CREATE INDEX idx_metrics_date ON public.metrics(date);
CREATE INDEX idx_metrics_structure ON public.metrics(structure);