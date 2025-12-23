import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { splashedToast } from "@/hooks/useSplashedToast";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Mail, Lock, Eye, EyeClosed, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const Auth = () => {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  // Detect if desktop with mouse (not touch device)
  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    setIsDesktop(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // For 3D card effect (only on desktop)
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [8, -8]);
  const rotateY = useTransform(mouseX, [-300, 300], [-8, 8]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDesktop) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginEmail || !loginPassword) {
      splashedToast.error("Campos obrigatórios", "Por favor, preencha todos os campos");
      return;
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);

    if (error) {
      splashedToast.error("Erro ao fazer login", error.message);
    } else {
      splashedToast.success("Sucesso", "Login realizado com sucesso!");
      navigate("/");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signupEmail || !signupPassword || !signupConfirmPassword) {
      splashedToast.error("Campos obrigatórios", "Por favor, preencha todos os campos");
      return;
    }

    if (!signupEmail.includes('@') || !signupEmail.includes('.')) {
      splashedToast.error("Email inválido", "Por favor, insira um email válido");
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      splashedToast.error("Senhas não conferem", "As senhas digitadas não são iguais");
      return;
    }

    if (signupPassword.length < 6) {
      splashedToast.error("Senha muito curta", "A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword);
    setLoading(false);

    if (error) {
      splashedToast.error("Erro ao criar conta", error.message);
    } else {
      splashedToast.success("Conta criada!", "Você já pode fazer login");
      const { error: loginError } = await signIn(signupEmail, signupPassword);
      if (!loginError) {
        navigate("/");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background overflow-hidden relative isolate">
      {/* Background gradient effect using accent (orange) - pointer-events-none */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-gradient-to-b from-background via-background to-background">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,hsl(var(--accent)/0.15)_0%,transparent_70%)]" />
      </div>

      {/* Subtle noise texture overlay - pointer-events-none */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxwYXRoIGQ9Ik0wIDBoMzAwdjMwMEgweiIgZmlsdGVyPSJ1cmwoI2EpIiBvcGFjaXR5PSIuMDUiLz48L3N2Zz4=')] opacity-50" />

      {/* Top radial glow - pointer-events-none */}
      <div className="fixed top-0 left-0 right-0 h-64 z-0 pointer-events-none bg-gradient-to-b from-accent/5 to-transparent" />

      {/* Animated glow spots - pointer-events-none */}
      <motion.div
        className="fixed top-1/4 left-1/4 w-96 h-96 z-0 pointer-events-none bg-accent/10 rounded-full blur-3xl"
        animate={{
          x: [0, 50, 0],
          y: [0, -30, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="fixed bottom-1/4 right-1/4 w-96 h-96 z-0 pointer-events-none bg-accent/8 rounded-full blur-3xl"
        animate={{
          x: [0, -30, 0],
          y: [0, 50, 0],
          scale: [1.1, 1, 1.1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 w-full max-w-md px-4" style={isDesktop ? { perspective: "1000px" } : undefined}>
        <motion.div
          onMouseMove={isDesktop ? handleMouseMove : undefined}
          onMouseLeave={isDesktop ? handleMouseLeave : undefined}
          style={isDesktop ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
          className="relative"
        >
          {/* Card glow effect */}
          <div className="absolute -inset-1 rounded-2xl overflow-hidden pointer-events-none">
            {/* Traveling light beam effect */}
            <div className="absolute inset-0">
              {/* Top light beam */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{
                  background: "linear-gradient(90deg, transparent, hsl(var(--accent)), transparent)",
                  boxShadow: "0 0 20px 5px hsl(var(--accent) / 0.5)",
                }}
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
              {/* Right light beam */}
              <motion.div
                className="absolute top-0 right-0 bottom-0 w-[2px]"
                style={{
                  background: "linear-gradient(180deg, transparent, hsl(var(--accent)), transparent)",
                  boxShadow: "0 0 20px 5px hsl(var(--accent) / 0.5)",
                }}
                animate={{ y: ["-100%", "100%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: 0.75 }}
              />
              {/* Bottom light beam */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{
                  background: "linear-gradient(90deg, transparent, hsl(var(--accent)), transparent)",
                  boxShadow: "0 0 20px 5px hsl(var(--accent) / 0.5)",
                }}
                animate={{ x: ["100%", "-100%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: 1.5 }}
              />
              {/* Left light beam */}
              <motion.div
                className="absolute top-0 left-0 bottom-0 w-[2px]"
                style={{
                  background: "linear-gradient(180deg, transparent, hsl(var(--accent)), transparent)",
                  boxShadow: "0 0 20px 5px hsl(var(--accent) / 0.5)",
                }}
                animate={{ y: ["100%", "-100%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: 2.25 }}
              />
            </div>

            {/* Card border glow */}
            <div className="absolute inset-0 rounded-2xl border border-accent/20" />
          </div>

          {/* Glass card background */}
          <div className="relative bg-card/80 backdrop-blur-xl rounded-2xl border border-border/50 p-8 shadow-2xl">
            {/* Subtle card inner pattern */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/5 via-transparent to-accent/5 opacity-50 pointer-events-none" />

            {/* Logo and header */}
            <div className="relative flex flex-col items-center mb-8">
              <motion.div
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center mb-4 relative overflow-hidden"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <span className="text-2xl font-bold text-accent-foreground">Z</span>
                {/* Inner lighting effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-white/10 pointer-events-none" />
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground">Bem-vindo de volta</h1>
              <p className="text-muted-foreground text-sm mt-1">
                {activeTab === "login" ? "Faça login para continuar" : "Crie sua conta"}
              </p>
            </div>

            {/* Tab buttons */}
            <div className="relative flex mb-6 bg-muted/50 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setActiveTab("login")}
                className={cn(
                  "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200",
                  activeTab === "login"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("signup")}
                className={cn(
                  "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200",
                  activeTab === "signup"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Criar conta
              </button>
            </div>

            {/* Login form */}
            {activeTab === "login" && (
              <motion.form
                onSubmit={handleSignIn}
                className="relative space-y-4"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-foreground/80 text-sm">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="login-email"
                      type="text"
                      placeholder="Digite seu email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      onFocus={() => setFocusedInput("login-email")}
                      onBlur={() => setFocusedInput(null)}
                      disabled={loading}
                      className="pl-10 bg-muted/30 border-border/50 focus:border-accent focus:bg-muted/50 transition-all"
                    />
                    {focusedInput === "login-email" && (
                      <motion.div
                        className="absolute inset-0 rounded-md border-2 border-accent pointer-events-none"
                        layoutId="input-focus"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-foreground/80 text-sm">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Digite sua senha"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onFocus={() => setFocusedInput("login-password")}
                      onBlur={() => setFocusedInput(null)}
                      disabled={loading}
                      className="pl-10 pr-10 bg-muted/30 border-border/50 focus:border-accent focus:bg-muted/50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeClosed className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {focusedInput === "login-password" && (
                      <motion.div
                        className="absolute inset-0 rounded-md border-2 border-accent pointer-events-none"
                        layoutId="input-focus"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      />
                    )}
                  </div>
                </div>

                <div className="relative pt-2">
                  <div
                    className="absolute -inset-1 rounded-lg bg-gradient-to-r from-accent/50 to-accent/30 opacity-50 blur-sm animate-pulse pointer-events-none"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="relative w-full py-3 px-4 bg-accent hover:bg-accent/90 text-accent-foreground font-medium rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {loading ? (
                      <div
                        className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin"
                      />
                    ) : (
                      <>
                        Entrar
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            )}

            {/* Signup form */}
            {activeTab === "signup" && (
              <motion.form
                onSubmit={handleSignUp}
                className="relative space-y-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-foreground/80 text-sm">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Digite seu email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      onFocus={() => setFocusedInput("signup-email")}
                      onBlur={() => setFocusedInput(null)}
                      disabled={loading}
                      className="pl-10 bg-muted/30 border-border/50 focus:border-accent focus:bg-muted/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-foreground/80 text-sm">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="signup-password"
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="Crie uma senha"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      onFocus={() => setFocusedInput("signup-password")}
                      onBlur={() => setFocusedInput(null)}
                      disabled={loading}
                      className="pl-10 pr-10 bg-muted/30 border-border/50 focus:border-accent focus:bg-muted/50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSignupPassword ? <EyeClosed className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password" className="text-foreground/80 text-sm">Confirmar Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="signup-confirm-password"
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="Confirme sua senha"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      onFocus={() => setFocusedInput("signup-confirm")}
                      onBlur={() => setFocusedInput(null)}
                      disabled={loading}
                      className="pl-10 bg-muted/30 border-border/50 focus:border-accent focus:bg-muted/50 transition-all"
                    />
                  </div>
                </div>

                <div className="relative pt-2">
                  <div
                    className="absolute -inset-1 rounded-lg bg-gradient-to-r from-accent/50 to-accent/30 opacity-50 blur-sm animate-pulse pointer-events-none"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="relative w-full py-3 px-4 bg-accent hover:bg-accent/90 text-accent-foreground font-medium rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {loading ? (
                      <div
                        className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin"
                      />
                    ) : (
                      <>
                        Criar conta
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  Ao criar uma conta, você terá acesso limitado às funcionalidades. 
                  Para acesso completo, torne-se membro da comunidade.
                </p>
              </motion.form>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;
