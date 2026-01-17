-- Create table to store user custom voices
CREATE TABLE public.user_custom_voices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  voice_id TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_custom_voices ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own custom voices" 
ON public.user_custom_voices 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own custom voices" 
ON public.user_custom_voices 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom voices" 
ON public.user_custom_voices 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_user_custom_voices_user_id ON public.user_custom_voices(user_id);