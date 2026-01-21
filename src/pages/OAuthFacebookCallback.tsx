import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

type Status = "processing" | "success" | "error";

export default function OAuthFacebookCallback() {
  const [status, setStatus] = useState<Status>("processing");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [accountName, setAccountName] = useState<string>("");

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Get parameters from URL
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace("#", "?").split("?")[1] || "");
        
        const code = params.get("code") || hashParams.get("code");
        const stateParam = params.get("state") || hashParams.get("state");
        const errorParam = params.get("error") || hashParams.get("error");
        const errorDescription = params.get("error_description") || hashParams.get("error_description");

        // Check for Facebook OAuth errors
        if (errorParam) {
          throw new Error(errorDescription || errorParam);
        }

        if (!code) {
          throw new Error("Código de autorização não encontrado");
        }

        if (!stateParam) {
          throw new Error("Token de validação não encontrado");
        }

        // Parse state to get token
        let token: string;
        try {
          const stateData = JSON.parse(decodeURIComponent(stateParam));
          token = stateData.token;
        } catch {
          throw new Error("Token de validação inválido");
        }

        if (!token) {
          throw new Error("Token não encontrado no state");
        }

        // Call edge function to exchange code with token (no auth required)
        const response = await fetch(`${SUPABASE_URL}/functions/v1/facebook-oauth`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "exchange_code_with_token",
            code,
            token,
            redirect_uri: window.location.origin + window.location.pathname,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Erro ao conectar conta");
        }

        setAccountName(data.name || "");
        setStatus("success");

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.error("OAuth callback error:", err);
        setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido");
        setStatus("error");
      }
    };

    processCallback();
  }, []);

  const handleClose = () => {
    window.close();
  };

  const handleGoToSettings = () => {
    window.location.href = "/#/ads/settings";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === "processing" && (
              <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
            )}
            {status === "success" && (
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            )}
            {status === "error" && (
              <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            )}
          </div>

          <CardTitle>
            {status === "processing" && "Processando conexão..."}
            {status === "success" && "Conta conectada!"}
            {status === "error" && "Erro na conexão"}
          </CardTitle>

          <CardDescription>
            {status === "processing" && "Aguarde enquanto conectamos sua conta do Meta Ads"}
            {status === "success" && (
              <>
                {accountName ? (
                  <span>Conta <strong>{accountName}</strong> conectada com sucesso ao Zapdata!</span>
                ) : (
                  "Sua conta do Meta Ads foi conectada com sucesso!"
                )}
              </>
            )}
            {status === "error" && errorMessage}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {status === "success" && (
            <>
              <p className="text-sm text-center text-muted-foreground">
                Você pode fechar esta janela e voltar ao Zapdata.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Fechar janela
                </Button>
                <Button className="flex-1" onClick={handleGoToSettings}>
                  Ir para Configurações
                </Button>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <p className="text-sm text-center text-muted-foreground">
                Tente novamente ou entre em contato com o suporte.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Fechar
                </Button>
                <Button className="flex-1" onClick={handleGoToSettings}>
                  Tentar novamente
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
