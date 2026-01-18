-- Create facebook_event_logs table for event history
CREATE TABLE public.facebook_event_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.inbox_contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_value DECIMAL,
  pixel_id TEXT NOT NULL,
  action_source TEXT NOT NULL,
  page_id TEXT,
  ctwa_clid TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  facebook_trace_id TEXT,
  events_received INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.facebook_event_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own event logs"
ON public.facebook_event_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own event logs"
ON public.facebook_event_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX idx_facebook_event_logs_contact_id ON public.facebook_event_logs(contact_id);
CREATE INDEX idx_facebook_event_logs_user_id ON public.facebook_event_logs(user_id);
CREATE INDEX idx_facebook_event_logs_created_at ON public.facebook_event_logs(created_at DESC);