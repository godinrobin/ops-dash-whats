-- Remove the admin policy that allows seeing all products (causes issues with impersonation)
DROP POLICY IF EXISTS "Admins can view all products" ON public.products;