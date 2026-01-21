import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Copy, Check, Loader2, Clock } from "lucide-react";
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
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
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

        <div className="space-y-3 pt-2">
          {/* Option 1: Continue in this browser */}
          <Button 
            variant="outline"
            className="w-full h-auto p-4 justify-start gap-3 hover:bg-accent"
            onClick={handleContinueHere}
          >
            <ExternalLink className="h-5 w-5 text-primary shrink-0" />
            <div className="text-left">
              <p className="font-medium">Continuar neste navegador</p>
              <p className="text-xs text-muted-foreground font-normal">
                Conecte sua conta Meta Ads diretamente neste navegador
              </p>
            </div>
          </Button>

          {/* Option 2: Copy link for multilogin */}
          <div className="space-y-2">
            {!oauthLink ? (
              <Button 
                variant="outline"
                className="w-full h-auto p-4 justify-start gap-3 hover:bg-accent"
                onClick={handleGenerateLink}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                ) : (
                  <Copy className="h-5 w-5 text-primary shrink-0" />
                )}
                <div className="text-left">
                  <p className="font-medium">
                    {generating ? "Gerando link..." : "Copiar link para navegador multilogin"}
                  </p>
                  <p className="text-xs text-muted-foreground font-normal">
                    Gere um link para conectar em outro navegador (anti-detect, multilogin, etc.)
                  </p>
                </div>
              </Button>
            ) : (
              <div className="p-4 border rounded-lg space-y-3 bg-accent/30">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    Link gerado com sucesso!
                  </p>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Expira em 5 minutos</span>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
