-- Create table for system access purchases (extensions, etc.)
CREATE TABLE public.system_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  system_id TEXT NOT NULL,
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.system_access ENABLE ROW LEVEL SECURITY;

-- Create unique constraint to prevent duplicate purchases
CREATE UNIQUE INDEX idx_system_access_user_system ON public.system_access(user_id, system_id);

-- Create policies for user access
CREATE POLICY "Users can view their own access"
ON public.system_access
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own access"
ON public.system_access
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_system_access_user_id ON public.system_access(user_id);
CREATE INDEX idx_system_access_system_id ON public.system_access(system_id);