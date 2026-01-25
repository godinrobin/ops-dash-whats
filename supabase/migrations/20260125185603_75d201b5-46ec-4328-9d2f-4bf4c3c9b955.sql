-- Add is_semi_full_member column to profiles
-- Semi-full members have:
-- - Full navigation access (no locks in sidebar)
-- - No free tier benefits (pay credits for everything)
-- - Credits system is always active for them

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_semi_full_member boolean DEFAULT false;

-- Add comment to explain the column
COMMENT ON COLUMN public.profiles.is_semi_full_member IS 'Semi-full member: has full navigation access but no free tier benefits (pays credits for everything)';