-- Allow any authenticated user to detect which authors are admins (for Feed admin badge/highlight)
-- This exposes only the fact that a given user has the 'admin' role.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Authenticated users can view admin roles'
  ) THEN
    CREATE POLICY "Authenticated users can view admin roles"
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (role = 'admin');
  END IF;
END $$;
