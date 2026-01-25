import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCreditsSystem } from "./useCreditsSystem";
import { useCredits } from "./useCredits";
import { useAccessLevel } from "./useAccessLevel";

interface SystemAccess {
  id: string;
  user_id: string;
  system_id: string;
  access_type: string;
  expires_at: string | null;
  purchased_at: string;
}

interface SystemPricing {
  system_id: string;
  system_name: string;
  price_type: string;
  credit_cost: number;
  free_tier_limit: number;
  free_tier_period: string | null;
  description: string | null;
}

interface UseSystemAccessReturn {
  /** Check if user has access to a system */
  hasAccess: (systemId: string) => boolean;
  /** Get days remaining for a subscription */
  daysRemaining: (systemId: string) => number | null;
  /** Purchase access to a system */
  purchaseAccess: (systemId: string) => Promise<boolean>;
  /** Get system pricing info */
  getSystemPricing: (systemId: string) => SystemPricing | null;
  /** All user accesses */
  accesses: SystemAccess[];
  /** All system pricing */
  pricing: SystemPricing[];
  /** Loading state */
  loading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
}

export const useSystemAccess = (): UseSystemAccessReturn => {
  const { user } = useAuth();
  const { isActive, isSimulatingPartial, isSemiFullMember, isTestUser } = useCreditsSystem();
  const { isFullMember } = useAccessLevel();
  const { deductCredits, canAfford, refresh: refreshCredits } = useCredits();
  const [accesses, setAccesses] = useState<SystemAccess[]>([]);
  const [pricing, setPricing] = useState<SystemPricing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccesses = useCallback(async () => {
    if (!user) {
      setAccesses([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_system_access')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching accesses:', error);
        return;
      }

      setAccesses(data ?? []);
    } catch (error) {
      console.error('Error:', error);
    }
  }, [user]);

  const fetchPricing = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_pricing')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching pricing:', error);
        return;
      }

      setPricing(data ?? []);
    } catch (error) {
      console.error('Error:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchAccesses(), fetchPricing()]);
      setLoading(false);
    };
    loadData();
  }, [fetchAccesses, fetchPricing]);

  const getSystemPricing = useCallback((systemId: string): SystemPricing | null => {
    return pricing.find(p => p.system_id === systemId) ?? null;
  }, [pricing]);

  const hasAccess = useCallback((systemId: string): boolean => {
    // Semi-full members and test users ALWAYS need purchased access (no free tier)
    if (isSemiFullMember || isTestUser) {
      const access = accesses.find(a => a.system_id === systemId);
      if (!access) return false;
      if (access.access_type === 'lifetime') return true;
      if (access.expires_at) {
        return new Date(access.expires_at) > new Date();
      }
      return false;
    }

    // If credits system is not active, full members have access to everything
    if (!isActive) {
      return isFullMember ?? true;
    }

    // If admin is simulating partial, pretend they don't have full member access
    const effectiveFullMember = isSimulatingPartial ? false : isFullMember;

    // Full members have access to all systems (except when simulating)
    if (effectiveFullMember) {
      return true;
    }

    // Check if user has purchased access
    const access = accesses.find(a => a.system_id === systemId);
    if (!access) return false;

    // Lifetime access never expires
    if (access.access_type === 'lifetime') return true;

    // Check if subscription is still valid
    if (access.expires_at) {
      return new Date(access.expires_at) > new Date();
    }

    return false;
  }, [isActive, isFullMember, isSimulatingPartial, isSemiFullMember, isTestUser, accesses]);

  const daysRemaining = useCallback((systemId: string): number | null => {
    const access = accesses.find(a => a.system_id === systemId);
    if (!access || access.access_type === 'lifetime') return null;
    if (!access.expires_at) return null;

    const now = new Date();
    const expires = new Date(access.expires_at);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [accesses]);

  const purchaseAccess = useCallback(async (systemId: string): Promise<boolean> => {
    if (!user || !isActive) return false;

    const systemPricing = getSystemPricing(systemId);
    if (!systemPricing) {
      console.error('System pricing not found:', systemId);
      return false;
    }

    // Check if user can afford
    if (!canAfford(systemPricing.credit_cost)) {
      return false;
    }

    try {
      // Deduct credits
      const success = await deductCredits(
        systemPricing.credit_cost,
        systemId,
        `Compra de acesso: ${systemPricing.system_name}`
      );

      if (!success) return false;

      // Calculate expiration
      const expiresAt = systemPricing.price_type === 'monthly'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Insert access record
      const { error } = await supabase
        .from('user_system_access')
        .upsert({
          user_id: user.id,
          system_id: systemId,
          access_type: systemPricing.price_type === 'monthly' ? 'subscription' : 'lifetime',
          expires_at: expiresAt
        }, {
          onConflict: 'user_id,system_id'
        });

      if (error) {
        console.error('Error inserting access:', error);
        return false;
      }

      await fetchAccesses();
      await refreshCredits();
      return true;
    } catch (error) {
      console.error('Error:', error);
      return false;
    }
  }, [user, isActive, getSystemPricing, canAfford, deductCredits, fetchAccesses, refreshCredits]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchAccesses(), fetchPricing()]);
    setLoading(false);
  }, [fetchAccesses, fetchPricing]);

  return {
    hasAccess,
    daysRemaining,
    purchaseAccess,
    getSystemPricing,
    accesses,
    pricing,
    loading,
    refresh
  };
};
