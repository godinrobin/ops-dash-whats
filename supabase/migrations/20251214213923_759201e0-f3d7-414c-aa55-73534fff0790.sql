-- Add is_full_member column to profiles table
ALTER TABLE public.profiles ADD COLUMN is_full_member boolean NOT NULL DEFAULT false;

-- Set all existing users as full members (they were created via webhook or before this feature)
UPDATE public.profiles SET is_full_member = true;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.is_full_member IS 'Indicates if user has full access to all features. True for Hubla webhook users, false for self-registered users.';