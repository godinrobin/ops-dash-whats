-- Create admin notifications table for real-time purchase/deposit alerts
CREATE TABLE public.admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,
  amount NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_read BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Only admins can view notifications
CREATE POLICY "Admins can view all notifications" 
ON public.admin_notifications 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Allow insert from authenticated users (for edge functions and triggers)
CREATE POLICY "Allow insert for authenticated" 
ON public.admin_notifications 
FOR INSERT 
WITH CHECK (true);

-- Admins can update (mark as read)
CREATE POLICY "Admins can update notifications" 
ON public.admin_notifications 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;