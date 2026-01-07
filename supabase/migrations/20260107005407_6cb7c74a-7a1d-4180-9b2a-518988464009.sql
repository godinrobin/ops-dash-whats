-- Create table for admin notification configurations
CREATE TABLE public.admin_notify_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notifier_instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  admin_instance_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notify_configs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own configs" 
ON public.admin_notify_configs 
FOR ALL 
USING (auth.uid() = user_id);

-- Create table for lead limit alerts configuration  
CREATE TABLE public.admin_notify_lead_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  config_id UUID NOT NULL REFERENCES public.admin_notify_configs(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  daily_limit INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notify_lead_limits ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own lead limits" 
ON public.admin_notify_lead_limits 
FOR ALL 
USING (auth.uid() = user_id);

-- Create table to track daily conversation counts (resets daily at São Paulo timezone)
CREATE TABLE public.admin_notify_daily_counts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID NOT NULL REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  conversation_count INTEGER NOT NULL DEFAULT 0,
  limit_notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, instance_id, date)
);

-- Enable RLS
ALTER TABLE public.admin_notify_daily_counts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own daily counts" 
ON public.admin_notify_daily_counts 
FOR ALL 
USING (auth.uid() = user_id);

-- Create table for instance disconnect monitoring
CREATE TABLE public.admin_notify_instance_monitor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  config_id UUID NOT NULL REFERENCES public.admin_notify_configs(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notify_instance_monitor ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own instance monitors" 
ON public.admin_notify_instance_monitor 
FOR ALL 
USING (auth.uid() = user_id);

-- Create table for sales monitoring
CREATE TABLE public.admin_notify_sales_monitor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  config_id UUID NOT NULL REFERENCES public.admin_notify_configs(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notify_sales_monitor ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own sales monitors" 
ON public.admin_notify_sales_monitor 
FOR ALL 
USING (auth.uid() = user_id);

-- Add trigger for updated_at on all tables
CREATE TRIGGER update_admin_notify_configs_updated_at
  BEFORE UPDATE ON public.admin_notify_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_notify_lead_limits_updated_at
  BEFORE UPDATE ON public.admin_notify_lead_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_notify_daily_counts_updated_at
  BEFORE UPDATE ON public.admin_notify_daily_counts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();