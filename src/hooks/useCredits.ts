import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCreditsSystem } from "./useCreditsSystem";

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  system_id: string | null;
  created_at: string;
}

interface UseCreditsReturn {
  /** Current credit balance */
  balance: number;
  /** Whether balance is loading */
  loading: boolean;
  /** Check if user can afford an amount */
  canAfford: (amount: number) => boolean;
  /** Deduct credits for a system usage */
  deductCredits: (amount: number, systemId: string, description: string) => Promise<boolean>;
  /** Get recent transactions */
  transactions: CreditTransaction[];
  /** Refresh balance */
  refresh: () => Promise<void>;
  /** Convert credits to BRL display */
  creditsToReais: (credits: number) => string;
  /** Convert BRL to credits */
  reaisToCredits: (reais: number) => number;
}

// 1 credit = R$6.50
const CREDIT_VALUE_BRL = 6.50;

export const useCredits = (): UseCreditsReturn => {
  const { user } = useAuth();
  const { isActive, isSemiFullMember, isTestUser } = useCreditsSystem();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    if (!user) {
      setBalance(0);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching balance:', error);
        return;
      }

      setBalance(data?.balance ?? 0);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching transactions:', error);
        return;
      }

      setTransactions(data ?? []);
    } catch (error) {
      console.error('Error:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, [fetchBalance, fetchTransactions]);

  const canAfford = useCallback((amount: number): boolean => {
    return balance >= amount;
  }, [balance]);

  const deductCredits = useCallback(async (
    amount: number,
    systemId: string,
    description: string
  ): Promise<boolean> => {
    // Semi-full members and test users ALWAYS need to pay, regardless of global system status
    const requiresPayment = isActive || isSemiFullMember || isTestUser;
    if (!user || !requiresPayment) return true; // If system is not active for this user, allow usage
    if (!canAfford(amount)) return false;

    try {
      const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: user.id,
        p_amount: amount,
        p_system_id: systemId,
        p_description: description
      });

      if (error) {
        console.error('Error deducting credits:', error);
        return false;
      }

      if (data) {
        // Update local balance optimistically
        setBalance(prev => prev - amount);
        fetchTransactions();
      }

      return data;
    } catch (error) {
      console.error('Error:', error);
      return false;
    }
  }, [user, isActive, isSemiFullMember, isTestUser, canAfford, fetchTransactions]);

  const creditsToReais = useCallback((credits: number): string => {
    const value = credits * CREDIT_VALUE_BRL;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }, []);

  const reaisToCredits = useCallback((reais: number): number => {
    return reais / CREDIT_VALUE_BRL;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchBalance(), fetchTransactions()]);
  }, [fetchBalance, fetchTransactions]);

  return {
    balance,
    loading,
    canAfford,
    deductCredits,
    transactions,
    refresh,
    creditsToReais,
    reaisToCredits
  };
};
