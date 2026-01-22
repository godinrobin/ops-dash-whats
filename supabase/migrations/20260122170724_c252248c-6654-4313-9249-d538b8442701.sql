-- Create table to store authorized PIX recipients for fake receipt detection
CREATE TABLE public.tag_whats_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_tag_whats_recipients_user_id ON public.tag_whats_recipients(user_id);

-- Enable RLS
ALTER TABLE public.tag_whats_recipients ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own recipients"
ON public.tag_whats_recipients
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recipients"
ON public.tag_whats_recipients
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipients"
ON public.tag_whats_recipients
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipients"
ON public.tag_whats_recipients
FOR DELETE
USING (auth.uid() = user_id);

-- Add fake detection toggle to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS fake_receipt_detection_enabled BOOLEAN DEFAULT false;