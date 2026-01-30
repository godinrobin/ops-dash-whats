import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const REVALIDATION_INTERVAL = 30000; // 30 seconds

export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearAdminContent = useCallback(() => {
    // Clear admin content from DOM for security
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, []);

  const validateAdminAccess = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.log('[AdminRoute] No session token');
        return false;
      }

      const { data, error } = await supabase.functions.invoke('validate-admin-access', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('[AdminRoute] Edge function error:', error);
        return false;
      }

      return data?.isAdmin === true;
    } catch (err) {
      console.error('[AdminRoute] Validation error:', err);
      return false;
    }
  }, [user]);

  const handleInvalidAccess = useCallback(() => {
    clearAdminContent();
    setIsAdmin(false);
    setChecking(false);
    navigate("/", { replace: true });
  }, [clearAdminContent, navigate]);

  // Initial validation
  useEffect(() => {
    let isMounted = true;

    const checkAdmin = async () => {
      console.log("[AdminRoute] Starting validation", { authLoading, userId: user?.id });
      
      if (authLoading) {
        console.log("[AdminRoute] Auth still loading...");
        return;
      }

      if (!user) {
        console.log("[AdminRoute] No user, redirecting to /auth");
        if (isMounted) {
          navigate("/auth", { replace: true });
          setChecking(false);
        }
        return;
      }

      const isAdminValid = await validateAdminAccess();
      
      if (!isMounted) return;

      if (!isAdminValid) {
        console.log("[AdminRoute] User is NOT admin");
        handleInvalidAccess();
        return;
      }

      console.log("[AdminRoute] User is admin! Loading panel...");
      setIsAdmin(true);
      setChecking(false);
    };

    checkAdmin();

    return () => {
      isMounted = false;
    };
  }, [user, authLoading, navigate, validateAdminAccess, handleInvalidAccess]);

  // Revalidation loop every 30 seconds
  useEffect(() => {
    if (!isAdmin || checking) return;

    const revalidate = async () => {
      console.log("[AdminRoute] Revalidating admin access...");
      const stillAdmin = await validateAdminAccess();
      
      if (!stillAdmin) {
        console.log("[AdminRoute] Admin access revoked during session");
        handleInvalidAccess();
      }
    };

    intervalRef.current = setInterval(revalidate, REVALIDATION_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAdmin, checking, validateAdminAccess, handleInvalidAccess]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-lg text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div ref={containerRef} data-admin-content>
      {children}
    </div>
  );
};
