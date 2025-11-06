-- Create table for organized numbers
CREATE TABLE public.organized_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  numero TEXT NOT NULL,
  celular TEXT NOT NULL,
  status TEXT NOT NULL,
  operacao TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.organized_numbers ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own numbers"
ON public.organized_numbers
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own numbers"
ON public.organized_numbers
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own numbers"
ON public.organized_numbers
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own numbers"
ON public.organized_numbers
FOR DELETE
USING (auth.uid() = user_id);