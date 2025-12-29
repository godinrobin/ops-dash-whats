import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Systems that are available to all users (including non-members)
const FREE_SYSTEMS = [
  "marketplace",
  "metricas",
  "organizador-numeros",
  "track-ofertas",
  "zap-spy"
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

export const useAccessLevel = () => {
  const { user } = useAuth();
  const [isFullMember, setIsFullMember] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccessStatus = async () => {
      if (!user) {
        setIsFullMember(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // Fetch both membership status and admin role in parallel
        const [profileResult, roleResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("is_full_member")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle()
        ]);

        // Set membership status - default to true if no profile found
        setIsFullMember(profileResult.data?.is_full_member ?? true);

        // Set admin status
        setIsAdmin(!!roleResult.data);
        
      } catch (error) {
        console.error("Error checking access level:", error);
        setIsFullMember(true);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAccessStatus();
  }, [user]);

  const canAccessSystem = (systemPath: string): boolean => {
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
  };

  const isRestrictedSystem = (systemPath: string): boolean => {
    const normalizedPath = systemPath.replace(/^\//, "").toLowerCase();
    return MEMBER_ONLY_SYSTEMS.some(system => 
      normalizedPath === system || normalizedPath.startsWith(system)
    );
  };

  return {
    isFullMember,
    isAdmin,
    loading,
    canAccessSystem,
    isRestrictedSystem,
    FREE_SYSTEMS,
    MEMBER_ONLY_SYSTEMS
  };
};
