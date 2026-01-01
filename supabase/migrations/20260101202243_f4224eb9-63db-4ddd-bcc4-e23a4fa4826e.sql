-- Create Tag Whats configurations table
CREATE TABLE public.tag_whats_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID NOT NULL REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  filter_images BOOLEAN NOT NULL DEFAULT true,
  filter_pdfs BOOLEAN NOT NULL DEFAULT true,
  pago_label_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, instance_id)
);

-- Enable RLS
ALTER TABLE public.tag_whats_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own tag_whats_configs"
ON public.tag_whats_configs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tag_whats_configs"
ON public.tag_whats_configs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tag_whats_configs"
ON public.tag_whats_configs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tag_whats_configs"
ON public.tag_whats_configs
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_tag_whats_configs_updated_at
BEFORE UPDATE ON public.tag_whats_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create Tag Whats processing logs table
CREATE TABLE public.tag_whats_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  config_id UUID NOT NULL REFERENCES public.tag_whats_configs(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'image' or 'pdf'
  is_pix_payment BOOLEAN NOT NULL DEFAULT false,
  label_applied BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  ai_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tag_whats_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for logs
CREATE POLICY "Users can view their own tag_whats_logs"
ON public.tag_whats_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tag_whats_logs"
ON public.tag_whats_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);