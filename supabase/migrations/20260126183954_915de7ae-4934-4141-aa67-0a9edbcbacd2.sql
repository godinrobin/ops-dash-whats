-- Add double credits configuration
INSERT INTO public.credits_system_config (key, value)
VALUES ('double_credits_enabled', '{"enabled": false, "enabled_at": null, "enabled_by": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Update add_credits function to support double credits for full members
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_type TEXT,
  p_description TEXT,
  p_reference_id TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_final_amount NUMERIC;
  v_is_full_member BOOLEAN;
  v_double_credits_enabled BOOLEAN;
BEGIN
  v_final_amount := p_amount;
  
  -- Check if this is a purchase and double credits is enabled
  IF p_type = 'purchase' THEN
    -- Check if double credits is enabled
    SELECT COALESCE((value->>'enabled')::boolean, false)
    INTO v_double_credits_enabled
    FROM public.credits_system_config
    WHERE key = 'double_credits_enabled';
    
    -- Check if user is a full member
    SELECT COALESCE(is_full_member, false)
    INTO v_is_full_member
    FROM public.profiles
    WHERE id = p_user_id;
    
    -- Double credits for full members if enabled
    IF v_double_credits_enabled AND v_is_full_member THEN
      v_final_amount := p_amount * 2;
      RAISE LOG '[ADD-CREDITS] Double credits applied for user %, original: %, final: %', p_user_id, p_amount, v_final_amount;
    END IF;
  END IF;
  
  -- Insert or update balance
  INSERT INTO public.user_credits (user_id, balance)
  VALUES (p_user_id, v_final_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + v_final_amount,
      updated_at = now();
  
  -- Record transaction with original amount in description if doubled
  INSERT INTO public.credit_transactions (user_id, amount, type, description, reference_id)
  VALUES (
    p_user_id, 
    v_final_amount, 
    p_type, 
    CASE 
      WHEN v_final_amount != p_amount THEN p_description || ' (2x bônus)'
      ELSE p_description
    END,
    p_reference_id
  );
  
  RETURN TRUE;
END;
$$;