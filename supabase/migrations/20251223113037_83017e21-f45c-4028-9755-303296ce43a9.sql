-- Create table for custom variables per user
CREATE TABLE public.inbox_custom_variables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.inbox_custom_variables ENABLE ROW LEVEL SECURITY;

-- Create policy for user access
CREATE POLICY "Users can manage their own variables"
ON public.inbox_custom_variables
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_inbox_custom_variables_updated_at
BEFORE UPDATE ON public.inbox_custom_variables
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();