-- Create table for saved deliverables
CREATE TABLE public.saved_deliverables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  config JSONB NOT NULL,
  html_content TEXT NOT NULL,
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.saved_deliverables ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own deliverables" 
ON public.saved_deliverables 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own deliverables" 
ON public.saved_deliverables 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deliverables" 
ON public.saved_deliverables 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deliverables" 
ON public.saved_deliverables 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_saved_deliverables_updated_at
BEFORE UPDATE ON public.saved_deliverables
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();