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

interface MaturadorInstance {
  id: string;
  status: string;
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
  const { isActive, activatedAt, isSimulatingPartial, isAdminTesting, isSemiFullMember } = useCreditsSystem();
  const { isFullMember } = useAccessLevel();
  const { deductCredits, canAfford, refresh: refreshCredits } = useCredits();
  const [subscriptions, setSubscriptions] = useState<InstanceSubscription[]>([]);
  const [instances, setInstances] = useState<MaturadorInstance[]>([]);
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

  // Fetch connected instances directly from maturador_instances for fallback
  const fetchInstances = useCallback(async () => {
    if (!user) {
      setInstances([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('id, status, created_at')
        .eq('user_id', user.id)
        .in('status', ['connected', 'open'])
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching instances:', error);
        return;
      }

      setInstances(data ?? []);
    } catch (error) {
      console.error('Error:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchSubscriptions();
    fetchInstances();
  }, [fetchSubscriptions, fetchInstances]);

  // Sort subscriptions by created_at to determine order
  const sortedSubscriptions = [...subscriptions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  const totalInstances = subscriptions.length;
  
  // For full members (not simulating and not semi-full), they get 3 free instances (first 3 by creation order)
  // When simulating partial or semi-full member, treat as 0 free instances
  const effectiveFullMember = (isSimulatingPartial || isSemiFullMember) ? false : isFullMember;
  
  // Count how many of the first 3 instances exist
  const freeInstancesUsed = effectiveFullMember 
    ? Math.min(FREE_INSTANCES_LIMIT, sortedSubscriptions.length)
    : 0;
  const freeInstancesRemaining = effectiveFullMember 
    ? Math.max(0, FREE_INSTANCES_LIMIT - freeInstancesUsed)
    : 0;
  
  // In admin test mode or partial simulation, we simulate as if the system is active
  const isTestingActive = isAdminTesting || isSimulatingPartial;

  // Check if an instance is free based on its position in creation order
  const isInstanceFree = useCallback((instanceId: string): boolean => {
    if (isSimulatingPartial || isSemiFullMember) {
      // In partial simulation or semi-full members, no instances are free
      return false;
    }
    
    if (!effectiveFullMember) {
      return false;
    }
    
    // First, try to find in subscriptions table
    const subIndex = sortedSubscriptions.findIndex(s => s.instance_id === instanceId);
    if (subIndex !== -1) {
      // First 3 subscriptions are free for full members
      return subIndex < FREE_INSTANCES_LIMIT;
    }
    
    // FALLBACK: When subscriptions table is empty (e.g., admin test mode),
    // use direct position in connected maturador_instances
    // The 3 oldest CONNECTED instances are considered free
    const instanceIndex = instances.findIndex(i => i.id === instanceId);
    if (instanceIndex === -1) return false;
    
    return instanceIndex < FREE_INSTANCES_LIMIT;
  }, [sortedSubscriptions, effectiveFullMember, isSimulatingPartial, isSemiFullMember, instances]);

  const getDaysRemaining = useCallback((instanceId: string): number | null => {
    const subscription = subscriptions.find(s => s.instance_id === instanceId);
    
    // Check if this instance is free (using fallback logic)
    const isFree = (() => {
      if (isSimulatingPartial) return false;
      if (!effectiveFullMember) return false;
      
      // Check in subscriptions first
      const subIndex = sortedSubscriptions.findIndex(s => s.instance_id === instanceId);
      if (subIndex !== -1) return subIndex < FREE_INSTANCES_LIMIT;
      
      // Fallback to instances position
      const instIndex = instances.findIndex(i => i.id === instanceId);
      if (instIndex === -1) return false;
      return instIndex < FREE_INSTANCES_LIMIT;
    })();
    
    // In test modes, simulate expiration for non-free instances
    if (isTestingActive) {
      // If instance is free (by fallback logic), no expiration
      if (isFree) return null;
      
      // In partial simulation, all instances are "extra" and need renewal
      if (isSimulatingPartial) {
        if (subscription?.expires_at) {
          const now = new Date();
          const expires = new Date(subscription.expires_at);
          const diff = expires.getTime() - now.getTime();
          if (diff <= 0) return 0;
          return Math.ceil(diff / (1000 * 60 * 60 * 24));
        }
        // Simulate 3 days for instances without expiration
        return 3;
      }
      
      // In admin test mode, non-free instances get 3 days default
      if (subscription?.expires_at) {
        const now = new Date();
        const expires = new Date(subscription.expires_at);
        const diff = expires.getTime() - now.getTime();
        if (diff <= 0) return 0;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
      }
      return 3; // Default to 3 days for testing
    }
    
    if (!subscription) return null;
    
    // Free instances don't expire (unless system was just activated)
    if (subscription.is_free && !activatedAt) return null;
    
    if (!subscription.expires_at) return null;

    const now = new Date();
    const expires = new Date(subscription.expires_at);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [subscriptions, activatedAt, isTestingActive, isSimulatingPartial, effectiveFullMember, sortedSubscriptions, instances]);

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
    const shouldBeFree = effectiveFM && sortedSubscriptions.length < FREE_INSTANCES_LIMIT;

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
  }, [user, isActive, isFullMember, isSimulatingPartial, sortedSubscriptions.length, fetchSubscriptions]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchSubscriptions(), fetchInstances()]);
    setLoading(false);
  }, [fetchSubscriptions, fetchInstances]);

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
