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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkMembershipStatus = async () => {
      if (!user) {
        setIsFullMember(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("is_full_member")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error("Error fetching membership status:", error);
          // Default to full member if there's an error (fail-safe for existing users)
          setIsFullMember(true);
        } else {
          setIsFullMember(data?.is_full_member ?? true);
        }
      } catch (error) {
        console.error("Error checking membership:", error);
        setIsFullMember(true);
      } finally {
        setLoading(false);
      }
    };

    checkMembershipStatus();
  }, [user]);

  const canAccessSystem = (systemPath: string): boolean => {
    // If still loading or no user, assume access
    if (loading || isFullMember === null) return true;
    
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
    loading,
    canAccessSystem,
    isRestrictedSystem,
    FREE_SYSTEMS,
    MEMBER_ONLY_SYSTEMS
  };
};
