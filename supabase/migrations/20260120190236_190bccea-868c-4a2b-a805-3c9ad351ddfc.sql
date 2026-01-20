-- Table to store latest contact activity (typing/recording) reliably via DB realtime
CREATE TABLE IF NOT EXISTS public.inbox_contact_activity (
  contact_id UUID PRIMARY KEY REFERENCES public.inbox_contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_contact_activity_user_id ON public.inbox_contact_activity(user_id);

ALTER TABLE public.inbox_contact_activity ENABLE ROW LEVEL SECURITY;

-- RLS: users can read their own activity rows
DO $$ BEGIN
  CREATE POLICY "Users can read their contact activity"
  ON public.inbox_contact_activity
  FOR SELECT
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: users can upsert their own activity rows (not required for backend, but safe)
DO $$ BEGIN
  CREATE POLICY "Users can insert their contact activity"
  ON public.inbox_contact_activity
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their contact activity"
  ON public.inbox_contact_activity
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_inbox_contact_activity_updated_at ON public.inbox_contact_activity;
CREATE TRIGGER update_inbox_contact_activity_updated_at
BEFORE UPDATE ON public.inbox_contact_activity
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime on this table so the frontend can listen to updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_contact_activity;