-- Create user activities table for tracking user actions
CREATE TABLE public.user_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_user_activities_user_id ON public.user_activities(user_id);
CREATE INDEX idx_user_activities_created_at ON public.user_activities(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;

-- Users can insert their own activities
CREATE POLICY "Users can insert their own activities"
ON public.user_activities
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all activities
CREATE POLICY "Admins can view all activities"
ON public.user_activities
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));