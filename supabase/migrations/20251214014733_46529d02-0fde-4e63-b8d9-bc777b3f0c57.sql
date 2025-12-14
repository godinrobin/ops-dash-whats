-- Create table for platform margins configuration
CREATE TABLE public.platform_margins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_name text NOT NULL UNIQUE,
  margin_percent numeric NOT NULL DEFAULT 30,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Enable RLS
ALTER TABLE public.platform_margins ENABLE ROW LEVEL SECURITY;

-- Only admins can manage margins
CREATE POLICY "Admins can manage margins"
ON public.platform_margins
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can read margins (needed for edge functions)
CREATE POLICY "Anyone can read margins"
ON public.platform_margins
FOR SELECT
USING (true);

-- Insert default margins
INSERT INTO public.platform_margins (system_name, margin_percent) VALUES
  ('sms', 30),
  ('smm', 30);

-- Create trigger for updated_at
CREATE TRIGGER update_platform_margins_updated_at
BEFORE UPDATE ON public.platform_margins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();