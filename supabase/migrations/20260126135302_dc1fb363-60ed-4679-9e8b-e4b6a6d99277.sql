-- Create table for Logzz shipment events (Expedição Tradicional)
CREATE TABLE public.logzz_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  webhook_id UUID REFERENCES public.logzz_webhooks(id),
  
  -- Informações do Envio
  creation_date TEXT,
  code TEXT,
  status TEXT,
  cost DECIMAL,
  product TEXT,
  quantity INTEGER,
  shipping_date TEXT,
  delivery_date TEXT,
  tracking_code TEXT,
  carrier TEXT,
  freight_modality TEXT,
  freight_cost DECIMAL,
  sender TEXT,
  external_id TEXT,
  
  -- Informações do Destinatário
  recipient_name TEXT,
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_document TEXT,
  recipient_zip_code TEXT,
  recipient_street TEXT,
  recipient_number TEXT,
  recipient_complement TEXT,
  recipient_neighborhood TEXT,
  recipient_city TEXT,
  recipient_state TEXT,
  recipient_country TEXT,
  
  -- Informações da Agência
  agency_zip_code TEXT,
  agency_street TEXT,
  agency_number TEXT,
  agency_neighborhood TEXT,
  agency_city TEXT,
  
  -- Payload original
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.logzz_shipments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own shipments" ON public.logzz_shipments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert shipments" ON public.logzz_shipments
  FOR INSERT WITH CHECK (true);

-- Index for faster queries
CREATE INDEX idx_logzz_shipments_user_id ON public.logzz_shipments(user_id);
CREATE INDEX idx_logzz_shipments_created_at ON public.logzz_shipments(created_at DESC);