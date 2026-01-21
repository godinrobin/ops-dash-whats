-- Create table for temporary OAuth tokens (for cross-browser authentication)
CREATE TABLE public.ads_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ads_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tokens
CREATE POLICY "Users can view own tokens" ON public.ads_oauth_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens" ON public.ads_oauth_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index for cleanup and lookups
CREATE INDEX idx_ads_oauth_tokens_expires ON public.ads_oauth_tokens(expires_at);
CREATE INDEX idx_ads_oauth_tokens_token ON public.ads_oauth_tokens(token);

-- Cleanup function for expired tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.ads_oauth_tokens 
  WHERE expires_at < NOW() OR used_at IS NOT NULL;
END;
$$;