-- Add lead rotation notification settings to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notify_on_lead_rotation boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS lead_rotation_limit integer DEFAULT 30;

-- Create table to track daily lead counts per instance (to avoid duplicate notifications)
CREATE TABLE IF NOT EXISTS public.lead_rotation_daily_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  instance_id uuid NOT NULL REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  lead_count integer NOT NULL DEFAULT 0,
  notification_sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, instance_id, date)
);

-- Enable RLS
ALTER TABLE public.lead_rotation_daily_counts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own lead rotation counts"
ON public.lead_rotation_daily_counts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lead rotation counts"
ON public.lead_rotation_daily_counts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lead rotation counts"
ON public.lead_rotation_daily_counts
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lead rotation counts"
ON public.lead_rotation_daily_counts
FOR DELETE
USING (auth.uid() = user_id);

-- Service role policy for edge functions
CREATE POLICY "Service role can manage all lead rotation counts"
ON public.lead_rotation_daily_counts
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_lead_rotation_daily_counts_user_date ON public.lead_rotation_daily_counts(user_id, date);
CREATE INDEX IF NOT EXISTS idx_lead_rotation_daily_counts_instance_date ON public.lead_rotation_daily_counts(instance_id, date);