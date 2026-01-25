import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCreditsSystem } from "./useCreditsSystem";
import { useAccessLevel } from "./useAccessLevel";

interface FreeTierUsage {
  system_id: string;
  usage_count: number;
  period_start: string;
  period_end: string;
}

interface SystemFreeTier {
  systemId: string;
  limit: number;
  period: '10min' | 'day' | 'month' | null;
}

interface UseFreeTierUsageReturn {
  /** Get current usage for a system */
  getUsage: (systemId: string) => { used: number; limit: number; canUse: boolean };
  /** Increment usage for a system */
  incrementUsage: (systemId: string) => Promise<boolean>;
  /** Get remaining free uses */
  getRemainingFree: (systemId: string) => number;
  /** Check if user has free tier for a system */
  hasFreeTier: (systemId: string) => boolean;
  /** All usage records */
  usages: FreeTierUsage[];
  /** Loading state */
  loading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
}

// Free tier configuration for full members
const FREE_TIER_CONFIG: SystemFreeTier[] = [
  { systemId: 'gerador_audio', limit: 10, period: 'day' }, // Also has 3/10min limit handled separately
  { systemId: 'gerador_criativos', limit: 3, period: 'day' },
  { systemId: 'criador_entregavel', limit: 30, period: 'day' },
  { systemId: 'instancia_whatsapp', limit: 3, period: null }, // 3 free total
];

// Get period boundaries based on type
const getPeriodBoundaries = (period: '10min' | 'day' | 'month' | null): { start: Date; end: Date } => {
  const now = new Date();
  
  switch (period) {
    case '10min': {
      const minutes = Math.floor(now.getMinutes() / 10) * 10;
      const start = new Date(now);
      start.setMinutes(minutes, 0, 0);
      const end = new Date(start);
      end.setMinutes(minutes + 10);
      return { start, end };
    }
    case 'day': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start, end };
    }
    default:
      // No period = lifetime free tier
      return {
        start: new Date(0),
        end: new Date('2099-12-31')
      };
  }
};

export const useFreeTierUsage = (): UseFreeTierUsageReturn => {
  const { user } = useAuth();
  const { isActive, isSimulatingPartial, isSemiFullMember } = useCreditsSystem();
  const { isFullMember } = useAccessLevel();
  const [usages, setUsages] = useState<FreeTierUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsages = useCallback(async () => {
    if (!user) {
      setUsages([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch all usage records for the user
      const { data, error } = await supabase
        .from('user_free_tier_usage')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching usages:', error);
        return;
      }

      setUsages(data ?? []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUsages();
  }, [fetchUsages]);

  const getFreeTierConfig = useCallback((systemId: string): SystemFreeTier | null => {
    return FREE_TIER_CONFIG.find(c => c.systemId === systemId) ?? null;
  }, []);

  const hasFreeTier = useCallback((systemId: string): boolean => {
    // Partial members, simulating partial, or semi-full members have no free tier
    if (isSimulatingPartial || !isFullMember || isSemiFullMember) return false;
    
    return FREE_TIER_CONFIG.some(c => c.systemId === systemId);
  }, [isFullMember, isSimulatingPartial, isSemiFullMember]);

  const getUsage = useCallback((systemId: string): { used: number; limit: number; canUse: boolean } => {
    // If credits system is not active, no limits apply
    if (!isActive) {
      return { used: 0, limit: Infinity, canUse: true };
    }

    const config = getFreeTierConfig(systemId);
    
    // No free tier for this system or user
    if (!config || !hasFreeTier(systemId)) {
      return { used: 0, limit: 0, canUse: false };
    }

    const { start, end } = getPeriodBoundaries(config.period);
    
    // Find usage record for current period
    const usage = usages.find(u => 
      u.system_id === systemId &&
      new Date(u.period_start) <= new Date() &&
      new Date(u.period_end) > new Date()
    );

    const used = usage?.usage_count ?? 0;
    const canUse = used < config.limit;

    return { used, limit: config.limit, canUse };
  }, [isActive, usages, getFreeTierConfig, hasFreeTier]);

  const getRemainingFree = useCallback((systemId: string): number => {
    const { used, limit, canUse } = getUsage(systemId);
    if (!canUse && limit === 0) return 0;
    return Math.max(0, limit - used);
  }, [getUsage]);

  const incrementUsage = useCallback(async (systemId: string): Promise<boolean> => {
    if (!user || !isActive) return true;

    const config = getFreeTierConfig(systemId);
    if (!config || !hasFreeTier(systemId)) return false;

    const { start, end } = getPeriodBoundaries(config.period);

    try {
      // Try to upsert the usage record
      const { data: existingUsage } = await supabase
        .from('user_free_tier_usage')
        .select('*')
        .eq('user_id', user.id)
        .eq('system_id', systemId)
        .gte('period_end', new Date().toISOString())
        .lte('period_start', new Date().toISOString())
        .maybeSingle();

      if (existingUsage) {
        // Update existing record
        const { error } = await supabase
          .from('user_free_tier_usage')
          .update({ usage_count: existingUsage.usage_count + 1 })
          .eq('id', existingUsage.id);

        if (error) {
          console.error('Error updating usage:', error);
          return false;
        }
      } else {
        // Create new record
        const { error } = await supabase
          .from('user_free_tier_usage')
          .insert({
            user_id: user.id,
            system_id: systemId,
            usage_count: 1,
            period_start: start.toISOString(),
            period_end: end.toISOString()
          });

        if (error) {
          console.error('Error inserting usage:', error);
          return false;
        }
      }

      // Refresh usages
      await fetchUsages();
      return true;
    } catch (error) {
      console.error('Error:', error);
      return false;
    }
  }, [user, isActive, getFreeTierConfig, hasFreeTier, fetchUsages]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchUsages();
    setLoading(false);
  }, [fetchUsages]);

  return {
    getUsage,
    incrementUsage,
    getRemainingFree,
    hasFreeTier,
    usages,
    loading,
    refresh
  };
};
