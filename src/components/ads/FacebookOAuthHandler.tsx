import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { splashedToast } from "@/hooks/useSplashedToast";

const FACEBOOK_REDIRECT_URI = "https://zapdata.co/";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface OAuthResult {
  code: string;
  state?: string;
  cleanHash?: string;
}

function extractFacebookOAuthCode(): OAuthResult | null {
  // Check query string first (Facebook returns code here)
  const searchParams = new URLSearchParams(window.location.search);
  const codeFromSearch = searchParams.get("code");
  const stateFromSearch = searchParams.get("state");
  
  if (codeFromSearch) {
    return { 
      code: codeFromSearch, 
      state: stateFromSearch || undefined 
    };
  }

  // Fallback: check hash (legacy support)
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return null;

  const query = hash.slice(qIndex + 1);
  const hashParams = new URLSearchParams(query);
  const codeFromHash = hashParams.get("code");
  if (!codeFromHash) return null;

  return { 
    code: codeFromHash, 
    state: hashParams.get("state") || undefined,
    cleanHash: hash.slice(0, qIndex) 
  };
}

/**
 * Handles Facebook OAuth return globally.
 * Supports two flows:
 * 1. Same-browser: User is logged in, code is exchanged directly
 * 2. Cross-browser: User completed OAuth in another browser with a pre-authorized token
 */
export default function FacebookOAuthHandler() {
  const { session, loading } = useAuth();
  const processingRef = useRef(false);
  const [crossBrowserStatus, setCrossBrowserStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [crossBrowserMessage, setCrossBrowserMessage] = useState("");

  useEffect(() => {
    const result = extractFacebookOAuthCode();
    if (!result) return;
    if (processingRef.current) return;
    if (loading) return;

    // Check if this is a cross-browser flow (has state with token)
    let crossBrowserToken: string | null = null;
    if (result.state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(result.state));
        crossBrowserToken = stateData.token || null;
      } catch {
        // Not a valid JSON state, proceed with normal flow
      }
    }

    // Cross-browser flow: user is NOT logged in here but has a pre-authorized token
    if (crossBrowserToken && !session) {
      processingRef.current = true;
      setCrossBrowserStatus("processing");
      
      // Clean URL immediately
      window.history.replaceState({}, document.title, window.location.pathname);

      (async () => {
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/facebook-oauth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "exchange_code_with_token",
              code: result.code,
              token: crossBrowserToken,
              redirect_uri: FACEBOOK_REDIRECT_URI,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Erro ao conectar conta");
          }

          setCrossBrowserStatus("success");
          setCrossBrowserMessage(data.name ? `Conta ${data.name} conectada!` : "Conta conectada com sucesso!");
        } catch (e) {
          console.error("Cross-browser OAuth error:", e);
          setCrossBrowserStatus("error");
          setCrossBrowserMessage(e instanceof Error ? e.message : "Erro desconhecido");
        }
      })();
      
      return;
    }

    // Normal flow: user IS logged in
    if (!session) return;

    processingRef.current = true;

    // If the code came inside the hash, clean it immediately
    if (result.cleanHash) {
      window.location.hash = result.cleanHash;
    }

    // Remove ?code=... from the URL
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash || "#/"}`);

    (async () => {
      try {
        const { error } = await supabase.functions.invoke("facebook-oauth", {
          body: {
            action: "exchange_code",
            code: result.code,
            redirect_uri: FACEBOOK_REDIRECT_URI,
          },
        });

        if (error) throw error;

        splashedToast.success("Conta do Facebook conectada!");
      } catch (e) {
        console.error("Facebook OAuth callback error:", e);
        splashedToast.error("Erro ao conectar conta");
      } finally {
        // Always land on Settings after the callback
        window.location.hash = "#/ads/settings";
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
      }
    })();
  }, [session, loading]);

  // Show a simple UI for cross-browser flow (user is not logged in)
  if (crossBrowserStatus !== "idle") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-4 p-6 rounded-lg border border-border bg-card text-center space-y-4">
          {crossBrowserStatus === "processing" && (
            <>
              <div className="h-16 w-16 mx-auto rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <h2 className="text-xl font-semibold">Conectando conta...</h2>
              <p className="text-muted-foreground">Aguarde enquanto processamos sua conexão</p>
            </>
          )}
          
          {crossBrowserStatus === "success" && (
            <>
              <div className="h-16 w-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-green-600">{crossBrowserMessage}</h2>
              <p className="text-muted-foreground">Você pode fechar esta janela e voltar ao Zapdata.</p>
              <button 
                onClick={() => window.close()}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/80 transition-colors"
              >
                Fechar janela
              </button>
            </>
          )}
          
          {crossBrowserStatus === "error" && (
            <>
              <div className="h-16 w-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-red-600">Erro na conexão</h2>
              <p className="text-muted-foreground">{crossBrowserMessage}</p>
              <button 
                onClick={() => window.close()}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/80 transition-colors"
              >
                Fechar
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
