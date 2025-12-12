-- Create table to cache voice preview audio
CREATE TABLE public.voice_previews (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    voice_id TEXT NOT NULL UNIQUE,
    voice_name TEXT NOT NULL,
    audio_base64 TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voice_previews ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read voice previews
CREATE POLICY "Authenticated users can view voice previews"
ON public.voice_previews
FOR SELECT
USING (auth.role() = 'authenticated');

-- Only admins can insert/update voice previews
CREATE POLICY "Admins can manage voice previews"
ON public.voice_previews
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
);

-- Allow authenticated users to insert voice previews (for caching)
CREATE POLICY "Authenticated users can insert voice previews"
ON public.voice_previews
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');