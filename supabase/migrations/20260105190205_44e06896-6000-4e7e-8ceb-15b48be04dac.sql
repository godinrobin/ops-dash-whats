-- Table to store user notification preferences for Tag Whats
CREATE TABLE public.tag_whats_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  onesignal_player_id TEXT,
  device_type TEXT, -- 'ios', 'android', 'desktop'
  is_enabled BOOLEAN DEFAULT false,
  -- Individual notification types enabled
  nova_venda BOOLEAN DEFAULT true,
  pix_recebido BOOLEAN DEFAULT true,
  pingou BOOLEAN DEFAULT true,
  pix_x1 BOOLEAN DEFAULT true,
  venda_confirmada BOOLEAN DEFAULT true,
  dinheiro_conta BOOLEAN DEFAULT true,
  venda_x1 BOOLEAN DEFAULT true,
  pix_bolso BOOLEAN DEFAULT true,
  pix_confirmado BOOLEAN DEFAULT true,
  venda_paga BOOLEAN DEFAULT true,
  venda_aprovada BOOLEAN DEFAULT true,
  -- Fun notifications toggle
  fun_notifications_enabled BOOLEAN DEFAULT true,
  -- Sound file URL
  custom_sound_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, device_type)
);

-- Table to track daily sales count for fun notifications
CREATE TABLE public.tag_whats_daily_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sales_date DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE,
  sales_count INTEGER DEFAULT 0,
  last_milestone_notified INTEGER DEFAULT 0, -- 10, 20, 50, 100
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, sales_date)
);

-- Table to track notification rotation index
CREATE TABLE public.tag_whats_notification_rotation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'sale', 'fun_10', 'fun_20', 'fun_50', 'fun_100'
  current_index INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, notification_type)
);

-- Enable RLS
ALTER TABLE public.tag_whats_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_whats_daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_whats_notification_rotation ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification preferences
CREATE POLICY "Users can view their own notification preferences"
ON public.tag_whats_notification_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification preferences"
ON public.tag_whats_notification_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences"
ON public.tag_whats_notification_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification preferences"
ON public.tag_whats_notification_preferences FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policies for daily sales
CREATE POLICY "Users can view their own daily sales"
ON public.tag_whats_daily_sales FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily sales"
ON public.tag_whats_daily_sales FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily sales"
ON public.tag_whats_daily_sales FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policies for notification rotation
CREATE POLICY "Users can view their own rotation"
ON public.tag_whats_notification_rotation FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rotation"
ON public.tag_whats_notification_rotation FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rotation"
ON public.tag_whats_notification_rotation FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Admin policies for testing
CREATE POLICY "Admins can view all notification preferences"
ON public.tag_whats_notification_preferences FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all daily sales"
ON public.tag_whats_daily_sales FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_tag_whats_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_tag_whats_notification_preferences_timestamp
BEFORE UPDATE ON public.tag_whats_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_tag_whats_notification_timestamp();

CREATE TRIGGER update_tag_whats_daily_sales_timestamp
BEFORE UPDATE ON public.tag_whats_daily_sales
FOR EACH ROW EXECUTE FUNCTION public.update_tag_whats_notification_timestamp();

CREATE TRIGGER update_tag_whats_notification_rotation_timestamp
BEFORE UPDATE ON public.tag_whats_notification_rotation
FOR EACH ROW EXECUTE FUNCTION public.update_tag_whats_notification_timestamp();