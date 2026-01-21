import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Copy, Check, Loader2, Clock, Link } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { splashedToast } from "@/hooks/useSplashedToast";

interface FacebookConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueHere: () => void;
}

export default function FacebookConnectDialog({ 
  open, 
  onOpenChange, 
  onContinueHere 
}: FacebookConnectDialogProps) {
  const [oauthLink, setOauthLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Countdown timer effect
  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemaining = () => {
      const now = new Date().getTime();
      const expiry = expiresAt.getTime();
      const diff = Math.max(0, Math.floor((expiry - now) / 1000));
      setRemainingSeconds(diff);

      // If expired, reset the link
      if (diff <= 0) {
        setOauthLink(null);
        setExpiresAt(null);
      }
    };

    // Update immediately
    updateRemaining();

    // Update every second
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGenerateLink = async () => {
    setGenerating(true);
    setCopied(false);
    
    try {
      const { data, error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action: "generate_oauth_link" }
      });

      if (error) throw error;

      setOauthLink(data.oauth_link);
      setExpiresAt(new Date(data.expires_at));
      splashedToast.success("Link gerado com sucesso!");
    } catch (err) {
      console.error("Error generating OAuth link:", err);
      splashedToast.error("Erro ao gerar link");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!oauthLink) return;
    
    try {
      await navigator.clipboard.writeText(oauthLink);
      setCopied(true);
      splashedToast.success("Link copiado!");
      
      // Reset copied state after 3 seconds
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("Error copying link:", err);
      splashedToast.error("Erro ao copiar link");
    }
  };

  const handleContinueHere = () => {
    onOpenChange(false);
    onContinueHere();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setOauthLink(null);
      setCopied(false);
      setExpiresAt(null);
      setRemainingSeconds(0);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            Conectar Meta Ads
          </DialogTitle>
          <DialogDescription>
            Escolha como deseja conectar sua conta Meta Ads ao Zapdata
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          {/* Option 1: Continue in this browser */}
          <button 
            type="button"
            className="w-full p-4 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors flex items-start gap-3 text-left"
            onClick={handleContinueHere}
          >
            <ExternalLink className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Continuar neste navegador</p>
              <p className="text-xs text-muted-foreground">
                Conecte sua conta Meta Ads diretamente neste navegador
              </p>
            </div>
          </button>

          {/* Option 2: Copy link for multilogin */}
          {!oauthLink ? (
            <button 
              type="button"
              className="w-full p-4 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors flex items-start gap-3 text-left disabled:opacity-50"
              onClick={handleGenerateLink}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-5 w-5 animate-spin text-orange-500 shrink-0 mt-0.5" />
              ) : (
                <Link className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {generating ? "Gerando link..." : "Copiar link para navegador multilogin"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Gere um link para conectar em outro navegador (anti-detect, multilogin, etc.)
                </p>
              </div>
            </button>
          ) : (
            <div className="p-4 rounded-lg border border-border bg-accent/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    Link gerado!
                  </p>
                </div>
                
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock className="h-3.5 w-3.5 text-orange-500" />
                  <span className={remainingSeconds < 60 ? "text-red-500 font-medium" : "text-muted-foreground"}>
                    Expira em {formatTime(remainingSeconds)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Input 
                  value={oauthLink} 
                  readOnly 
                  className="text-xs font-mono bg-background"
                />
                <Button 
                  size="icon" 
                  variant={copied ? "default" : "outline"}
                  onClick={handleCopyLink}
                  className="shrink-0"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Cole este link no seu navegador multilogin e complete a autenticação com o Facebook.
                Após concluir, volte aqui e atualize a página.
              </p>

              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-xs"
                onClick={handleGenerateLink}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                ) : null}
                Gerar novo link
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
