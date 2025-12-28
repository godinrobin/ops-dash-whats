import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { RestrictedFeatureModal } from "@/components/RestrictedFeatureModal";
import Home from "@/pages/Home";

interface MemberRouteProps {
  children: React.ReactNode;
  featureName?: string;
}

export const MemberRoute = ({ children, featureName }: MemberRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isFullMember, setIsFullMember] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const checkMembership = async () => {
      if (!user) {
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
          console.error("Error checking membership:", error);
          // Default to full member if error (fail-safe for existing users)
          setIsFullMember(true);
        } else {
          setIsFullMember(data?.is_full_member ?? true);
          
          // If not a full member, show modal
          if (!data?.is_full_member) {
            setShowModal(true);
          }
        }
      } catch (error) {
        console.error("Error:", error);
        setIsFullMember(true);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      checkMembership();
    }
  }, [user, authLoading]);

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

  // If not a full member, show the Home page with blurred content area and modal
  if (isFullMember === false) {
    return (
      <div className="relative min-h-screen">
        {/* Show home page with functional header */}
        <Home restrictedMode restrictedFeatureName={featureName} />
        
        {/* Restricted modal */}
        <RestrictedFeatureModal
          open={showModal}
          onOpenChange={handleModalClose}
          featureName={featureName}
        />
      </div>
    );
  }

  return <>{children}</>;
};
