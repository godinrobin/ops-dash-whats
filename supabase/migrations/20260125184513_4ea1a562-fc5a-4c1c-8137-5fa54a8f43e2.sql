-- Add column to mark users who should experience credits system regardless of global status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS credits_system_test_user boolean DEFAULT false;

-- Set the test user
UPDATE public.profiles 
SET credits_system_test_user = true 
WHERE username = 'usuarioparcial@gmail.com';