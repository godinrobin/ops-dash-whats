import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { supabase } from "@/integrations/supabase/client";

export type CreditsSystemStatus = 'inactive' | 'admin_test' | 'admin_partial_simulation' | 'active';

interface CreditsSystemConfig {
  status: CreditsSystemStatus;
  activated_at: string | null;
}

interface UseCreditsSystemReturn {
  /** Whether the credits system is active for the current user */
  isActive: boolean;
  /** Whether admin is in test mode (sees credits UI but system is not live) */
  isAdminTesting: boolean;
  /** Whether admin is simulating as partial member */
  isSimulatingPartial: boolean;
  /** Whether this is a test user for the credits system */
  isTestUser: boolean;
  /** Current system status */
  systemStatus: CreditsSystemStatus;
  /** When the system was activated for all users */
  activatedAt: string | null;
  /** Loading state */
  loading: boolean;
  /** Refresh the system status */
  refresh: () => Promise<void>;
  /** Update the system status (admin only) */
  updateStatus: (newStatus: CreditsSystemStatus) => Promise<boolean>;
}

const CACHE_KEY = 'credits_system_status_cache';
const CACHE_TTL = 30 * 1000; // 30 seconds

interface CachedStatus {
  config: CreditsSystemConfig;
  timestamp: number;
}

const getCache = (): CreditsSystemConfig | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedStatus = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_TTL) return null;
    
    return data.config;
  } catch {
    return null;
  }
};

const setCache = (config: CreditsSystemConfig): void => {
  try {
    const data: CachedStatus = { config, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore
  }
};

export const useCreditsSystem = (): UseCreditsSystemReturn => {
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [config, setConfig] = useState<CreditsSystemConfig>({ status: 'inactive', activated_at: null });
  const [isTestUser, setIsTestUser] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user is a test user for credits system
  const checkTestUser = useCallback(async () => {
    if (!user) {
      setIsTestUser(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('credits_system_test_user')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking test user status:', error);
        return;
      }

      setIsTestUser(data?.credits_system_test_user ?? false);
    } catch (error) {
      console.error('Error:', error);
    }
  }, [user]);

  const fetchStatus = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCache();
      if (cached) {
        setConfig(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_credits_system_status');
      
      if (error) {
        console.error('Error fetching credits system status:', error);
        return;
      }

      const newConfig = data as unknown as CreditsSystemConfig;
      setConfig(newConfig);
      setCache(newConfig);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    checkTestUser();
  }, [fetchStatus, checkTestUser]);

  const updateStatus = useCallback(async (newStatus: CreditsSystemStatus): Promise<boolean> => {
    if (!isAdmin) return false;

    try {
      const newValue: CreditsSystemConfig = {
        status: newStatus,
        activated_at: newStatus === 'active' && config.activated_at === null
          ? new Date().toISOString()
          : config.activated_at
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
        .from('credits_system_config')
        .update({ value: newValue as any })
        .eq('key', 'system_status');

      if (error) {
        console.error('Error updating credits system status:', error);
        return false;
      }

      setConfig(newValue);
      setCache(newValue);
      localStorage.removeItem(CACHE_KEY); // Force refresh on next load
      return true;
    } catch (error) {
      console.error('Error:', error);
      return false;
    }
  }, [isAdmin, config.activated_at]);

  // Determine if credits system is active for the current user
  const isActive = (() => {
    // Test users always experience the credits system as active
    if (isTestUser) {
      return true;
    }

    switch (config.status) {
      case 'inactive':
        return false;
      case 'admin_test':
      case 'admin_partial_simulation':
        return isAdmin;
      case 'active':
        return true;
      default:
        return false;
    }
  })();

  const isAdminTesting = config.status === 'admin_test' && isAdmin;
  const isSimulatingPartial = config.status === 'admin_partial_simulation' && isAdmin;

  return {
    isActive,
    isAdminTesting,
    isSimulatingPartial,
    isTestUser,
    systemStatus: config.status,
    activatedAt: config.activated_at,
    loading,
    refresh: () => fetchStatus(true),
    updateStatus
  };
};
