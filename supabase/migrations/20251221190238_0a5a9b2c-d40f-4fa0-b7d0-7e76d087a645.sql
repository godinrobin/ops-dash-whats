-- Create table for WhatsApp charges/invoices
CREATE TABLE public.whatsapp_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT,
  charge_code TEXT NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  notes TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_charges ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own charges" 
ON public.whatsapp_charges 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own charges" 
ON public.whatsapp_charges 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own charges" 
ON public.whatsapp_charges 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own charges" 
ON public.whatsapp_charges 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admins can view all charges
CREATE POLICY "Admins can view all charges" 
ON public.whatsapp_charges 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_whatsapp_charges_updated_at
BEFORE UPDATE ON public.whatsapp_charges
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_whatsapp_charges_user_id ON public.whatsapp_charges(user_id);
CREATE INDEX idx_whatsapp_charges_status ON public.whatsapp_charges(status);
CREATE INDEX idx_whatsapp_charges_charge_code ON public.whatsapp_charges(charge_code);