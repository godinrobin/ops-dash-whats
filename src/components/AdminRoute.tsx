import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkAdmin = async () => {
      console.log("AdminRoute: Iniciando verificação", { authLoading, userId: user?.id });
      
      if (authLoading) {
        console.log("AdminRoute: Ainda carregando auth...");
        return;
      }

      if (!user) {
        console.log("AdminRoute: Sem usuário, redirecionando para /auth");
        if (isMounted) {
          navigate("/auth", { replace: true });
          setChecking(false);
        }
        return;
      }

      try {
        console.log("AdminRoute: Verificando role de admin para:", user.id);
        
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        console.log("AdminRoute: Resultado:", { data, error });

        if (!isMounted) return;

        if (error) {
          console.error("AdminRoute: Erro ao verificar role:", error);
          setIsAdmin(false);
          setChecking(false);
          navigate("/", { replace: true });
          return;
        }

        if (!data) {
          console.log("AdminRoute: Usuário não é admin");
          setIsAdmin(false);
          setChecking(false);
          navigate("/", { replace: true });
          return;
        }

        console.log("AdminRoute: Usuário é admin! Carregando painel...");
        setIsAdmin(true);
        setChecking(false);
      } catch (err) {
        console.error("AdminRoute: Erro inesperado:", err);
        if (isMounted) {
          setIsAdmin(false);
          setChecking(false);
          navigate("/", { replace: true });
        }
      }
    };

    checkAdmin();

    return () => {
      isMounted = false;
    };
  }, [user, authLoading, navigate]);

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

  return <>{children}</>;
};
