import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signUp: (username: string, password: string) => Promise<{ error: any }>;
  signIn: (username: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (username: string, password: string) => {
    try {
      // Check if username is already an email format (required for new signups)
      const isEmail = username.includes('@') && username.includes('.');
      if (!isEmail) {
        return { error: { message: "Por favor, use um email válido para se cadastrar" } };
      }

      const email = username.toLowerCase().trim();
      
      // Check if email already exists in profiles
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", email)
        .single();

      if (existingProfile) {
        return { error: { message: "Este email já está cadastrado" } };
      }

      const redirectUrl = `${window.location.origin}/`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: email,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (error.message?.includes('leaked') || error.message?.includes('compromised')) {
          return {
            error: {
              message: 'Esta senha foi encontrada em vazamentos de dados. Por favor, escolha uma senha diferente e única.'
            }
          };
        }
        if (error.message?.includes('already registered')) {
          return { error: { message: "Este email já está cadastrado" } };
        }
        return { error };
      }

      // Note: is_full_member will be false by default for self-registered users
      // The handle_new_user trigger creates the profile, but we need to ensure is_full_member = false

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signIn = async (username: string, password: string) => {
    try {
      // Check if username is already an email format
      const isEmail = username.includes('@') && username.includes('.');
      const email = isEmail ? username.toLowerCase().trim() : `${username.toLowerCase().trim()}@metricas.local`;
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: { message: "Usuário ou senha incorretos" } };
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      // Always clear local state and redirect, even if signOut fails
      setUser(null);
      setSession(null);
      window.location.hash = '#/auth';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        signUp,
        signIn,
        signOut,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
