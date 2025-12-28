import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOAuthRedirect, setIsOAuthRedirect] = useState(false);

  useEffect(() => {
    // Check if this is a Facebook OAuth redirect
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace('#', '').split('?')[1] || '');
    
    const hasCode = searchParams.has('code') || hashParams.has('code');
    const hasState = searchParams.has('state') || hashParams.has('state');
    const isFacebookRedirect = hasCode || window.location.href.includes('code=');
    
    if (isFacebookRedirect) {
      setIsOAuthRedirect(true);
      // Redirect to ads settings after a brief moment to allow OAuth handler to process
      setTimeout(() => {
        navigate('/ads/settings');
      }, 2000);
      return;
    }

    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname, navigate]);

  // Show loading state for OAuth redirects
  if (isOAuthRedirect) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-lg text-muted-foreground">Conectando com Facebook...</p>
          <p className="text-sm text-muted-foreground">Aguarde enquanto processamos sua autenticação</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Página não encontrada</p>
        <a href="/" className="text-primary underline hover:text-primary/80">
          Voltar ao Início
        </a>
      </div>
    </div>
  );
};

export default NotFound;
