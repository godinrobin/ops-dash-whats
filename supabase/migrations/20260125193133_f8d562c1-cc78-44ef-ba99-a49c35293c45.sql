-- Add comprehensive logging to deduct_credits function
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount numeric, p_system_id text, p_description text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance NUMERIC;
BEGIN
  RAISE LOG '[DEDUCT-CREDITS-RPC] Called with user_id=%, amount=%, system_id=%, desc=%', p_user_id, p_amount, p_system_id, p_description;
  
  -- Buscar saldo atual com lock
  SELECT balance INTO v_current_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  RAISE LOG '[DEDUCT-CREDITS-RPC] Current balance query result: found=%, balance=%', FOUND, v_current_balance;
  
  -- Se não existe registro, criar com saldo 0
  IF NOT FOUND THEN
    RAISE LOG '[DEDUCT-CREDITS-RPC] No user_credits record found, creating with 0 balance';
    INSERT INTO public.user_credits (user_id, balance)
    VALUES (p_user_id, 0);
    v_current_balance := 0;
  END IF;
  
  -- Verificar se tem saldo suficiente
  IF v_current_balance < p_amount THEN
    RAISE LOG '[DEDUCT-CREDITS-RPC] INSUFFICIENT FUNDS: balance=%, required=%', v_current_balance, p_amount;
    RETURN FALSE;
  END IF;
  
  RAISE LOG '[DEDUCT-CREDITS-RPC] Sufficient funds, proceeding with deduction';
  
  -- Deduzir créditos
  UPDATE public.user_credits
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  RAISE LOG '[DEDUCT-CREDITS-RPC] Credits deducted, new balance=%', v_current_balance - p_amount;
  
  -- Registrar transação
  INSERT INTO public.credit_transactions (user_id, amount, type, description, system_id)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_system_id);
  
  RAISE LOG '[DEDUCT-CREDITS-RPC] Transaction recorded successfully, returning TRUE';
  RETURN TRUE;
END;
$function$;