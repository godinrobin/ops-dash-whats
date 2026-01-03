import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImpersonationState {
  isImpersonating: boolean;
  impersonatedEmail: string | null;
  impersonatedUserId: string | null;
  originalAdminId: string | null;
}

interface ImpersonationContextType extends ImpersonationState {
  startImpersonation: (userId: string, userEmail: string) => Promise<void>;
  stopImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextType | null>(null);

const IMPERSONATION_KEY = "zapdata-impersonation";

export const ImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [state, setState] = useState<ImpersonationState>(() => {
    const saved = localStorage.getItem(IMPERSONATION_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          isImpersonating: false,
          impersonatedEmail: null,
          impersonatedUserId: null,
          originalAdminId: null,
        };
      }
    }
    return {
      isImpersonating: false,
      impersonatedEmail: null,
      impersonatedUserId: null,
      originalAdminId: null,
    };
  });

  useEffect(() => {
    if (state.isImpersonating) {
      localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(IMPERSONATION_KEY);
    }
  }, [state]);

  const startImpersonation = async (userId: string, userEmail: string) => {
    try {
      // Get current admin's ID
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        toast.error("Você não está logado");
        return;
      }

      // Set impersonation state
      setState({
        isImpersonating: true,
        impersonatedEmail: userEmail,
        impersonatedUserId: userId,
        originalAdminId: currentUser.id,
      });

      toast.success(`Agora você está visualizando como ${userEmail}`);
      navigate("/");
    } catch (err) {
      console.error("Error starting impersonation:", err);
      toast.error("Erro ao iniciar impersonação");
    }
  };

  const stopImpersonation = () => {
    setState({
      isImpersonating: false,
      impersonatedEmail: null,
      impersonatedUserId: null,
      originalAdminId: null,
    });
    toast.success("Voltou para a conta de admin");
    navigate("/admin-panel");
  };

  return (
    <ImpersonationContext.Provider value={{ ...state, startImpersonation, stopImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
};

export const useImpersonation = () => {
  const context = useContext(ImpersonationContext);
  if (!context) {
    throw new Error("useImpersonation must be used within ImpersonationProvider");
  }
  return context;
};