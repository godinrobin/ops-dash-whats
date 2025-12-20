-- Create table for verified contacts cache
CREATE TABLE public.maturador_verified_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  profile_pic_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT true,
  last_fetched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maturador_verified_contacts ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read verified contacts
CREATE POLICY "Anyone authenticated can view verified contacts"
ON public.maturador_verified_contacts
FOR SELECT
USING (auth.role() = 'authenticated');

-- Service role can manage contacts (for edge function updates)
CREATE POLICY "Service role can manage verified contacts"
ON public.maturador_verified_contacts
FOR ALL
USING (true)
WITH CHECK (true);

-- Insert the initial verified contacts
INSERT INTO public.maturador_verified_contacts (phone) VALUES
  ('551128326088'),
  ('551140044828'),
  ('551123575200'),
  ('5511943763874'),
  ('5521995027179'),
  ('5511999910621'),
  ('554141414141'),
  ('5511999151515'),
  ('5511941042222'),
  ('5511974529842'),
  ('5511997177777'),
  ('5511964874908'),
  ('5511976731540'),
  ('551140049090'),
  ('556140040001'),
  ('553130034070'),
  ('551140027007')
ON CONFLICT (phone) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_maturador_verified_contacts_updated_at
BEFORE UPDATE ON public.maturador_verified_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();