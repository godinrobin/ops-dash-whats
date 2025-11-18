import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!loading && !user) {
        console.log("AdminRoute: Usuário não autenticado, redirecionando para /auth");
        navigate("/auth");
        return;
      }

      if (user) {
        console.log("AdminRoute: Verificando role de admin para usuário:", user.id);
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        console.log("AdminRoute: Resultado da query:", { data, error });

        if (error) {
          console.error("AdminRoute: Erro ao verificar role:", error);
          navigate("/");
          setIsAdmin(false);
        } else if (!data) {
          console.log("AdminRoute: Usuário não é admin, redirecionando para /");
          navigate("/");
          setIsAdmin(false);
        } else {
          console.log("AdminRoute: Usuário é admin!");
          setIsAdmin(true);
        }
      }
    };

    checkAdmin();
  }, [user, loading, navigate]);

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Verificando permissões...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return <>{children}</>;
};
