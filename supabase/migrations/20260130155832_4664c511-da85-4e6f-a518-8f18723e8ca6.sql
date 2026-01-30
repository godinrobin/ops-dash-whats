
-- 1. Create atomic purchase_credits function with row locking to prevent race conditions
CREATE OR REPLACE FUNCTION public.purchase_credits(
  p_user_id UUID,
  p_package_id UUID,
  p_package_name TEXT,
  p_credits NUMERIC,
  p_price_brl NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_balance NUMERIC;
  v_final_credits NUMERIC;
  v_is_full_member BOOLEAN;
  v_double_credits_enabled BOOLEAN;
  v_new_wallet_balance NUMERIC;
  v_description TEXT;
BEGIN
  -- Lock the wallet row to prevent race conditions
  SELECT balance INTO v_wallet_balance
  FROM sms_user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Check if wallet exists
  IF v_wallet_balance IS NULL THEN
    -- Create wallet if doesn't exist
    INSERT INTO sms_user_wallets (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Saldo insuficiente. Por favor, recarregue sua conta.'
    );
  END IF;
  
  -- Check sufficient balance
  IF v_wallet_balance < p_price_brl THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Saldo insuficiente. Você tem R$ %s e precisa de R$ %s', 
        to_char(v_wallet_balance, 'FM999990.00'),
        to_char(p_price_brl, 'FM999990.00')
      ),
      'wallet_balance', v_wallet_balance,
      'required', p_price_brl
    );
  END IF;
  
  -- Calculate final credits (check for double bonus)
  v_final_credits := p_credits;
  
  SELECT COALESCE((value->>'enabled')::boolean, false)
  INTO v_double_credits_enabled
  FROM credits_system_config
  WHERE key = 'double_credits_enabled';
  
  SELECT COALESCE(is_full_member, false)
  INTO v_is_full_member
  FROM profiles
  WHERE id = p_user_id;
  
  IF v_double_credits_enabled AND v_is_full_member THEN
    v_final_credits := p_credits * 2;
    v_description := format('Compra de pacote: %s (2x bônus)', p_package_name);
  ELSE
    v_description := format('Compra de pacote: %s', p_package_name);
  END IF;
  
  -- Debit wallet
  v_new_wallet_balance := v_wallet_balance - p_price_brl;
  
  UPDATE sms_user_wallets
  SET balance = v_new_wallet_balance,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Add credits
  INSERT INTO user_credits (user_id, balance)
  VALUES (p_user_id, v_final_credits)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + v_final_credits,
      updated_at = now();
  
  -- Record transaction
  INSERT INTO credit_transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, v_final_credits, 'purchase', v_description, p_package_id);
  
  RAISE LOG '[PURCHASE-CREDITS] User % purchased % credits for R$ %, new wallet balance: %',
    p_user_id, v_final_credits, p_price_brl, v_new_wallet_balance;
  
  RETURN jsonb_build_object(
    'success', true,
    'credits_added', v_final_credits,
    'wallet_balance', v_new_wallet_balance,
    'description', v_description
  );
END;
$$;

-- 2. Identify and delete duplicate transactions (keep only the first one per user/package/minute)
WITH duplicates AS (
  SELECT id, user_id, amount
  FROM (
    SELECT 
      id,
      user_id,
      amount,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, reference_id, DATE_TRUNC('minute', created_at) 
        ORDER BY created_at ASC
      ) as rn
    FROM credit_transactions
    WHERE type = 'purchase'
  ) ranked
  WHERE rn > 1
)
DELETE FROM credit_transactions
WHERE id IN (SELECT id FROM duplicates);

-- 3. Recalculate user_credits balances based on remaining transactions
WITH correct_balances AS (
  SELECT user_id, SUM(amount) as total
  FROM credit_transactions
  GROUP BY user_id
)
UPDATE user_credits uc
SET balance = COALESCE(cb.total, 0),
    updated_at = now()
FROM correct_balances cb
WHERE uc.user_id = cb.user_id;
