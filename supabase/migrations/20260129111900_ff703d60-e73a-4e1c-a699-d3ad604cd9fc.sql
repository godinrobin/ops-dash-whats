-- Converter todos os membros parciais existentes para semi-full
-- Membros parciais são: is_full_member = false AND is_semi_full_member = false
UPDATE public.profiles
SET is_semi_full_member = true
WHERE is_full_member = false AND is_semi_full_member = false;

-- Alterar o default para novos usuários serem semi-full
ALTER TABLE public.profiles 
  ALTER COLUMN is_semi_full_member SET DEFAULT true;