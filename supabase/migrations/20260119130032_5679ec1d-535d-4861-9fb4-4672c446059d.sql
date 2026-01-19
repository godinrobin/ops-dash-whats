-- Create folders table for organizing flows
CREATE TABLE public.inbox_flow_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inbox_flow_folders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own folders" 
ON public.inbox_flow_folders 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own folders" 
ON public.inbox_flow_folders 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders" 
ON public.inbox_flow_folders 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders" 
ON public.inbox_flow_folders 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admin policy for folder management
CREATE POLICY "Admins can manage all folders"
ON public.inbox_flow_folders
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Add folder_id column to inbox_flows table
ALTER TABLE public.inbox_flows 
ADD COLUMN folder_id UUID REFERENCES public.inbox_flow_folders(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX idx_inbox_flows_folder_id ON public.inbox_flows(folder_id);
CREATE INDEX idx_inbox_flow_folders_user_id ON public.inbox_flow_folders(user_id);