import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { splashedToast } from "@/hooks/useSplashedToast";

const FACEBOOK_REDIRECT_URI = "https://zapdata.co/";

function extractFacebookOAuthCode(): { code: string; cleanHash?: string } | null {
  const searchParams = new URLSearchParams(window.location.search);
  const codeFromSearch = searchParams.get("code");
  if (codeFromSearch) return { code: codeFromSearch };

  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return null;

  const query = hash.slice(qIndex + 1);
  const hashParams = new URLSearchParams(query);
  const codeFromHash = hashParams.get("code");
  if (!codeFromHash) return null;

  return { code: codeFromHash, cleanHash: hash.slice(0, qIndex) };
}

/**
 * Handles Facebook OAuth return globally.
 * Why: Facebook may block redirect URIs with fragments (#). We use https://zapdata.co/ as redirect,
 * then route internally to #/ads/settings after exchanging the code.
 */
export default function FacebookOAuthHandler() {
  const { session, loading } = useAuth();
  const processingRef = useRef(false);

  useEffect(() => {
    const result = extractFacebookOAuthCode();
    if (!result) return;
    if (processingRef.current) return;
    if (loading) return;
    if (!session) return;

    processingRef.current = true;

    // If the code came inside the hash, clean it immediately to avoid re-processing.
    if (result.cleanHash) {
      window.location.hash = result.cleanHash;
    }

    // Remove ?code=... from the URL ASAP (avoid duplicate processing on rerenders)
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

  return null;
}
