import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCreditsSystem } from "./useCreditsSystem";
import { useCredits } from "./useCredits";
import { useAccessLevel } from "./useAccessLevel";

interface InstanceSubscription {
  id: string;
  instance_id: string;
  user_id: string;
  is_free: boolean;
  expires_at: string | null;
  last_renewal: string | null;
  warning_shown: boolean;
  created_at: string;
}

interface UseInstanceSubscriptionReturn {
  /** Number of free instances remaining (3 for full members) */
  freeInstancesRemaining: number;
  /** Total instances the user has */
  totalInstances: number;
  /** Check if an instance is free */
  isInstanceFree: (instanceId: string) => boolean;
  /** Get days remaining for an instance */
  getDaysRemaining: (instanceId: string) => number | null;
  /** Check if an instance is about to expire (3 days or less) */
  isAboutToExpire: (instanceId: string) => boolean;
  /** Renew an instance for 30 more days */
  renewInstance: (instanceId: string) => Promise<boolean>;
  /** Register a new instance (called when creating instances) */
  registerInstance: (instanceId: string) => Promise<boolean>;
  /** All subscriptions */
  subscriptions: InstanceSubscription[];
  /** Loading state */
  loading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
}

const FREE_INSTANCES_LIMIT = 3;
const RENEWAL_COST = 6; // 6 credits per 30 days
const DAYS_PER_RENEWAL = 30;

export const useInstanceSubscription = (): UseInstanceSubscriptionReturn => {
  const { user } = useAuth();
  const { isActive, activatedAt, isSimulatingPartial } = useCreditsSystem();
  const { isFullMember } = useAccessLevel();
  const { deductCredits, canAfford, refresh: refreshCredits } = useCredits();
  const [subscriptions, setSubscriptions] = useState<InstanceSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscriptions = useCallback(async () => {
    if (!user) {
      setSubscriptions([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('instance_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching subscriptions:', error);
        return;
      }

      setSubscriptions(data ?? []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  // Count free instances (first 3 created)
  const freeInstancesCount = subscriptions.filter(s => s.is_free).length;
  const totalInstances = subscriptions.length;
  
  // For full members (not simulating), they get 3 free instances
  const effectiveFullMember = isSimulatingPartial ? false : isFullMember;
  const freeInstancesRemaining = effectiveFullMember 
    ? Math.max(0, FREE_INSTANCES_LIMIT - freeInstancesCount)
    : 0;

  const isInstanceFree = useCallback((instanceId: string): boolean => {
    const subscription = subscriptions.find(s => s.instance_id === instanceId);
    return subscription?.is_free ?? false;
  }, [subscriptions]);

  const getDaysRemaining = useCallback((instanceId: string): number | null => {
    const subscription = subscriptions.find(s => s.instance_id === instanceId);
    if (!subscription) return null;
    
    // Free instances don't expire (unless system was just activated)
    if (subscription.is_free && !activatedAt) return null;
    
    if (!subscription.expires_at) return null;

    const now = new Date();
    const expires = new Date(subscription.expires_at);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [subscriptions, activatedAt]);

  const isAboutToExpire = useCallback((instanceId: string): boolean => {
    const days = getDaysRemaining(instanceId);
    if (days === null) return false;
    return days <= 3;
  }, [getDaysRemaining]);

  const renewInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    if (!user || !isActive) return false;

    // Check if user can afford
    if (!canAfford(RENEWAL_COST)) {
      return false;
    }

    try {
      // Deduct credits
      const success = await deductCredits(
        RENEWAL_COST,
        'instancia_whatsapp',
        'Renovação de instância WhatsApp (30 dias)'
      );

      if (!success) return false;

      // Calculate new expiration (from now + 30 days, or from current expiration + 30 days if still valid)
      const subscription = subscriptions.find(s => s.instance_id === instanceId);
      let newExpiration: Date;
      
      if (subscription?.expires_at) {
        const currentExpiration = new Date(subscription.expires_at);
        const now = new Date();
        // If current expiration is in the future, extend from there
        if (currentExpiration > now) {
          newExpiration = new Date(currentExpiration.getTime() + DAYS_PER_RENEWAL * 24 * 60 * 60 * 1000);
        } else {
          // If expired, extend from now
          newExpiration = new Date(now.getTime() + DAYS_PER_RENEWAL * 24 * 60 * 60 * 1000);
        }
      } else {
        newExpiration = new Date(Date.now() + DAYS_PER_RENEWAL * 24 * 60 * 60 * 1000);
      }

      // Update subscription
      const { error } = await supabase
        .from('instance_subscriptions')
        .update({
          expires_at: newExpiration.toISOString(),
          last_renewal: new Date().toISOString(),
          is_free: false
        })
        .eq('instance_id', instanceId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating subscription:', error);
        return false;
      }

      await fetchSubscriptions();
      await refreshCredits();
      return true;
    } catch (error) {
      console.error('Error:', error);
      return false;
    }
  }, [user, isActive, canAfford, deductCredits, subscriptions, fetchSubscriptions, refreshCredits]);

  const registerInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    if (!user) return false;

    // Determine if this instance should be free
    // Full members get first 3 free (unless simulating partial)
    const effectiveFM = isSimulatingPartial ? false : isFullMember;
    const shouldBeFree = effectiveFM && freeInstancesCount < FREE_INSTANCES_LIMIT;

    // Calculate expiration
    let expiresAt: string | null = null;
    
    if (!shouldBeFree && isActive) {
      // Paid instance: expires in 30 days
      expiresAt = new Date(Date.now() + DAYS_PER_RENEWAL * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const { error } = await supabase
        .from('instance_subscriptions')
        .insert({
          instance_id: instanceId,
          user_id: user.id,
          is_free: shouldBeFree,
          expires_at: expiresAt,
          last_renewal: shouldBeFree ? null : new Date().toISOString()
        });

      if (error) {
        // Might already exist, try upsert
        if (error.code === '23505') {
          console.log('Instance subscription already exists');
          return true;
        }
        console.error('Error registering instance:', error);
        return false;
      }

      await fetchSubscriptions();
      return true;
    } catch (error) {
      console.error('Error:', error);
      return false;
    }
  }, [user, isActive, isFullMember, isSimulatingPartial, freeInstancesCount, fetchSubscriptions]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchSubscriptions();
    setLoading(false);
  }, [fetchSubscriptions]);

  return {
    freeInstancesRemaining,
    totalInstances,
    isInstanceFree,
    getDaysRemaining,
    isAboutToExpire,
    renewInstance,
    registerInstance,
    subscriptions,
    loading,
    refresh
  };
};
