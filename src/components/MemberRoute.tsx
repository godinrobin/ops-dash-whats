import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

interface MemberRouteProps {
  children: React.ReactNode;
  featureName?: string;
}

/**
 * MemberRoute - Simplified wrapper that only checks authentication
 * All membership checks have been removed - all authenticated users have full access
 */
export const MemberRoute = ({ children }: MemberRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
};
