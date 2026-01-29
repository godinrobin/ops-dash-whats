
-- =====================================================
-- SECURITY FIX: Remove dangerous UPDATE policies
-- =====================================================

-- 1. CRITICAL: Remove user direct UPDATE on sms_user_wallets (fraud prevention)
DROP POLICY IF EXISTS "Users can update their own wallet" ON public.sms_user_wallets;

-- 2. CRITICAL: Remove user direct UPDATE on user_credits (fraud prevention)
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;

-- 3. CRITICAL: Add constraint to prevent negative balance on sms_user_wallets
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_user_wallets_balance_positive'
  ) THEN
    ALTER TABLE public.sms_user_wallets 
    ADD CONSTRAINT sms_user_wallets_balance_positive CHECK (balance >= 0);
  END IF;
END $$;

-- 4. CRITICAL: Add constraint to prevent negative balance on user_credits
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_credits_balance_positive'
  ) THEN
    ALTER TABLE public.user_credits 
    ADD CONSTRAINT user_credits_balance_positive CHECK (balance >= 0);
  END IF;
END $$;

-- 5. Drop the old unsafe profile update policy and create a basic one
-- The trigger prevent_self_member_promotion already handles blocking privilege escalation
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Recreate basic profile update policy (trigger handles sensitive field protection)
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 6. Enhance the existing trigger to cover more sensitive fields
CREATE OR REPLACE FUNCTION public.prevent_self_member_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if called by service_role (webhooks/Edge Functions)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot change sensitive fields
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    -- Prevent is_full_member escalation
    IF NEW.is_full_member IS DISTINCT FROM OLD.is_full_member THEN
      RAISE EXCEPTION 'Only admins can modify is_full_member';
    END IF;
    
    -- Prevent is_semi_full_member escalation
    IF NEW.is_semi_full_member IS DISTINCT FROM OLD.is_semi_full_member THEN
      RAISE EXCEPTION 'Only admins can modify is_semi_full_member';
    END IF;
    
    -- Prevent credits_system_test_user escalation
    IF NEW.credits_system_test_user IS DISTINCT FROM OLD.credits_system_test_user THEN
      RAISE EXCEPTION 'Only admins can modify credits_system_test_user';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 7. Create secure stored procedure for marketplace purchases
CREATE OR REPLACE FUNCTION public.marketplace_purchase(
  p_user_id UUID,
  p_product_type TEXT,
  p_product_name TEXT,
  p_quantity INTEGER,
  p_total_price DECIMAL(10,2),
  p_metadata JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance DECIMAL(10,2);
  v_order_id UUID;
  v_new_balance DECIMAL(10,2);
BEGIN
  -- Validate caller matches user_id (or is admin)
  IF auth.uid() != p_user_id AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Lock the wallet row for atomic update
  SELECT balance INTO v_current_balance
  FROM public.sms_user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Check if wallet exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Carteira não encontrada');
  END IF;
  
  -- Check sufficient balance
  IF v_current_balance < p_total_price THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Saldo insuficiente',
      'current_balance', v_current_balance,
      'required', p_total_price
    );
  END IF;
  
  -- Debit the wallet
  UPDATE public.sms_user_wallets
  SET balance = balance - p_total_price,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  v_new_balance := v_current_balance - p_total_price;
  
  -- Create order record
  INSERT INTO public.sms_orders (
    user_id, 
    product_type, 
    product_name, 
    quantity, 
    total_price, 
    status,
    metadata
  ) VALUES (
    p_user_id, 
    p_product_type, 
    p_product_name, 
    p_quantity, 
    p_total_price, 
    'completed',
    p_metadata
  )
  RETURNING id INTO v_order_id;
  
  -- Create transaction record
  INSERT INTO public.sms_transactions (
    user_id,
    order_id,
    amount,
    type,
    description
  ) VALUES (
    p_user_id,
    v_order_id,
    -p_total_price,
    'purchase',
    'Compra: ' || p_product_name || ' (x' || p_quantity || ')'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'new_balance', v_new_balance,
    'amount_debited', p_total_price
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8. Revoke direct execute on dangerous functions from public
REVOKE EXECUTE ON FUNCTION public.add_credits FROM public;
GRANT EXECUTE ON FUNCTION public.add_credits TO authenticated;

REVOKE EXECUTE ON FUNCTION public.deduct_credits FROM public;
GRANT EXECUTE ON FUNCTION public.deduct_credits TO authenticated;

REVOKE EXECUTE ON FUNCTION public.marketplace_purchase FROM public;
GRANT EXECUTE ON FUNCTION public.marketplace_purchase TO authenticated;
