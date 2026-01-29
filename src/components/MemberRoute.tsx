import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { supabase } from "@/integrations/supabase/client";
import { RestrictedFeatureModal } from "@/components/RestrictedFeatureModal";
import Home from "@/pages/Home";

interface MemberRouteProps {
  children: React.ReactNode;
  featureName?: string;
}

export const MemberRoute = ({ children, featureName }: MemberRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { effectiveUserId, isImpersonating } = useEffectiveUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [isFullMember, setIsFullMember] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const checkMembership = async () => {
      const userId = effectiveUserId || user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("is_full_member, is_semi_full_member, credits_system_test_user")
          .eq("id", userId)
          .single();

        if (error) {
          console.error("Error checking membership:", error);
          // SECURITY: Default to NO access if error (fail-secure)
          setIsFullMember(false);
        } else {
          // Semi-full members and test users get full navigation access (no locks)
          const semiFullStatus = data?.is_semi_full_member ?? false;
          const isTestUser = data?.credits_system_test_user ?? false;
          const baseMemberStatus = data?.is_full_member ?? true;
          
          // Grant navigation access if: full member OR semi-full OR test user
          const hasNavigationAccess = baseMemberStatus || semiFullStatus || isTestUser;
          setIsFullMember(hasNavigationAccess);
          
          // If not a full member, show modal (but skip if admin is impersonating)
          if (!hasNavigationAccess && !isImpersonating) {
            setShowModal(true);
          }
        }
      } catch (error) {
        console.error("Error:", error);
        // SECURITY: Default to NO access if error (fail-secure)
        setIsFullMember(false);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      checkMembership();
    }
  }, [user, authLoading, effectiveUserId, isImpersonating]);

  const handleModalClose = (open: boolean) => {
    setShowModal(open);
    if (!open) {
      // Redirect to home when modal is closed
      navigate("/");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  // If not a full member and not impersonating, show modal and prevent content access
  if (isFullMember === false && !isImpersonating) {
    return (
      <>
        {/* Show restricted modal immediately */}
        <RestrictedFeatureModal
          open={true}
          onOpenChange={handleModalClose}
          featureName={featureName}
        />
        
        {/* Blurred placeholder content */}
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4 opacity-20 blur-sm select-none pointer-events-none">
            <h1 className="text-4xl font-bold">Sistema Restrito</h1>
            <p className="text-muted-foreground">Conteúdo disponível apenas para membros</p>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
};
