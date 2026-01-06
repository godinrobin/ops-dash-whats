-- Create inbox-media bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('inbox-media', 'inbox-media', true)
ON CONFLICT (id) DO NOTHING;