import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Systems that are available to all users (including non-members)
const FREE_SYSTEMS = [
  "marketplace",
  "metricas",
  "organizador-numeros",
  "track-ofertas"
  // "zap-spy" - Removed: requires subscription in credits system
];

// Systems that require full membership
const MEMBER_ONLY_SYSTEMS = [
  "criador-funil",
  "gerador-criativos",
  "gerador-variacoes-video",
  "gerador-audio",
  "transcricao-audio",
  "tag-whats"
];

// Cache key for localStorage
const CACHE_KEY = 'access_level_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedAccessLevel {
  userId: string;
  isFullMember: boolean;
  isAdmin: boolean;
  timestamp: number;
}

const getCache = (userId: string): CachedAccessLevel | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedAccessLevel = JSON.parse(cached);
    
    // Verify cache is for current user and not expired
    if (data.userId !== userId) return null;
    if (Date.now() - data.timestamp > CACHE_TTL) return null;
    
    return data;
  } catch {
    return null;
  }
};

const setCache = (userId: string, isFullMember: boolean, isAdmin: boolean): void => {
  try {
    const data: CachedAccessLevel = {
      userId,
      isFullMember,
      isAdmin,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
};

const clearCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore localStorage errors
  }
};

export const useAccessLevel = () => {
  const { user } = useAuth();
  const [isFullMember, setIsFullMember] = useState<boolean | null>(null);
  const [isSemiFullMember, setIsSemiFullMember] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const checkAccessStatus = useCallback(async (forceRefresh = false) => {
    if (!user) {
      setIsFullMember(null);
      setIsSemiFullMember(false);
      setIsAdmin(false);
      setLoading(false);
      clearCache();
      return;
    }

    // Try to use cached value first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCache(user.id);
      if (cached) {
        setIsFullMember(cached.isFullMember);
        setIsAdmin(cached.isAdmin);
        setLoading(false);
        return;
      }
    }

    try {
      // Fetch membership status, admin role, test user flag, and semi-full status in parallel
      const [profileResult, roleResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("is_full_member, credits_system_test_user, is_semi_full_member")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle()
      ]);

      // Semi-full members: full navigation access but no free tier benefits
      const semiFullStatus = profileResult.data?.is_semi_full_member ?? false;
      
      // Credits test users should be treated as full members for navigation
      // but the credits system will still apply usage restrictions
      const isCreditsTestUser = profileResult.data?.credits_system_test_user ?? false;
      const baseMemberStatus = profileResult.data?.is_full_member ?? true;
      // If test user OR semi-full, grant full navigation access (no locks in sidebar)
      const memberStatus = (isCreditsTestUser || semiFullStatus) ? true : baseMemberStatus;
      const adminStatus = !!roleResult.data;

      setIsFullMember(memberStatus);
      setIsSemiFullMember(semiFullStatus);
      setIsAdmin(adminStatus);
      
      // Cache the result
      setCache(user.id, memberStatus, adminStatus);
      
    } catch (error) {
      console.error("Error checking access level:", error);
      // On error, default to full access to avoid blocking users
      setIsFullMember(true);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkAccessStatus();
  }, [checkAccessStatus]);

  // Re-check on window focus (user might have been updated in another tab)
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        checkAccessStatus(true); // Force refresh on focus
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, checkAccessStatus]);

  const canAccessSystem = useCallback((systemPath: string): boolean => {
    // If still loading or no user, assume access
    if (loading || isFullMember === null) return true;
    
    // Admins can access EVERYTHING
    if (isAdmin) return true;
    
    // Full members can access everything
    if (isFullMember) return true;
    
    // Check if system is in free systems list
    const normalizedPath = systemPath.replace(/^\//, "").toLowerCase();
    return FREE_SYSTEMS.some(system => 
      normalizedPath === system || normalizedPath.startsWith(system)
    );
  }, [loading, isFullMember, isAdmin]);

  const isRestrictedSystem = useCallback((systemPath: string): boolean => {
    const normalizedPath = systemPath.replace(/^\//, "").toLowerCase();
    return MEMBER_ONLY_SYSTEMS.some(system => 
      normalizedPath === system || normalizedPath.startsWith(system)
    );
  }, []);

  // Force refresh function for manual updates
  const refreshAccessLevel = useCallback(() => {
    clearCache();
    checkAccessStatus(true);
  }, [checkAccessStatus]);

  return {
    isFullMember,
    isSemiFullMember,
    isAdmin,
    loading,
    canAccessSystem,
    isRestrictedSystem,
    refreshAccessLevel,
    FREE_SYSTEMS,
    MEMBER_ONLY_SYSTEMS
  };
};
