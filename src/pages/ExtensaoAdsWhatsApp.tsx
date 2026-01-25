import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Chrome, CheckCircle, Lock, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { useCredits } from "@/hooks/useCredits";
import { InsufficientCreditsModal } from "@/components/credits/InsufficientCreditsModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const EXTENSION_COST = 1.50;
const SYSTEM_ID = 'extensao_ads_whatsapp';

const ExtensaoAdsWhatsApp = () => {
  useActivityTracker("page_visit", "Extensão Ads WhatsApp");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isActive: isCreditsActive, isSemiFullMember, loading: creditsLoading } = useCreditsSystem();
  const { deductCredits, canAfford, loading: balanceLoading } = useCredits();
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [checkingPurchase, setCheckingPurchase] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  // Check if user has already purchased the extension
  useEffect(() => {
    const checkPurchase = async () => {
      if (!user) {
        setCheckingPurchase(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('system_access')
          .select('id')
          .eq('user_id', user.id)
          .eq('system_id', SYSTEM_ID)
          .maybeSingle();

        if (!error && data) {
          setHasPurchased(true);
        }
      } catch (err) {
        console.error('Error checking purchase:', err);
      } finally {
        setCheckingPurchase(false);
      }
    };

    checkPurchase();
  }, [user]);

  const handleDownload = async () => {
    // Check if credits system is active and user is semi-full member
    const requiresPayment = (isCreditsActive || isSemiFullMember) && !hasPurchased;

    if (requiresPayment && isSemiFullMember) {
      // Semi-full members need to pay
      if (!canAfford(EXTENSION_COST)) {
        setShowInsufficientCredits(true);
        return;
      }

      setPurchasing(true);
      try {
        const success = await deductCredits(
          EXTENSION_COST,
          SYSTEM_ID,
          'Compra da Extensão Ads WhatsApp'
        );

        if (!success) {
          setShowInsufficientCredits(true);
          return;
        }

        // Register access
        await supabase.from('system_access').insert({
          user_id: user?.id,
          system_id: SYSTEM_ID,
        });

        setHasPurchased(true);
        toast.success('Extensão adquirida com sucesso!');
      } catch (error) {
        console.error('Error purchasing:', error);
        toast.error('Erro ao processar compra');
        return;
      } finally {
        setPurchasing(false);
      }
    }

    // Proceed with download
    window.open("https://joaolucassps.co/EXTENSAO-ZAPDATA.zip", "_blank");
  };

  const features = [
    "Filtrar apenas anúncios relacionados a WhatsApp",
    "Selecionar múltiplos anúncios de uma vez",
    "Salvar ofertas diretamente no Track Ofertas",
    "Integração automática com sua conta Zapdata"
  ];

  const instructions = [
    "Baixe o arquivo ZIP da extensão",
    "Extraia o conteúdo em uma pasta",
    "Acesse chrome://extensions no navegador",
    "Ative o \"Modo desenvolvedor\" no canto superior direito",
    "Clique em \"Carregar sem compactação\" e selecione a pasta extraída",
    "A extensão aparecerá na barra de ferramentas do Chrome",
    "Ao abrir a Biblioteca de Anúncios, faça login com sua conta Zapdata"
  ];

  const isLoading = creditsLoading || balanceLoading || checkingPurchase;
  const needsToPay = isSemiFullMember && !hasPurchased;

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">🧩 Extensão Ads WhatsApp</h1>
            <p className="text-muted-foreground">
              Extensão para Chrome que facilita a análise de anúncios na Biblioteca de Anúncios
            </p>
          </header>

          {/* Download Card */}
          <Card className="border-2 border-accent mb-8">
            <CardHeader className="text-center">
              <div className="mx-auto w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                <Chrome className="h-10 w-10 text-accent" />
              </div>
              <CardTitle className="text-2xl">FB Ads - Zap Data</CardTitle>
              <p className="text-muted-foreground">Criado por @joaolucassps</p>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-6">
                Extensão para Google Chrome que permite filtrar e salvar anúncios diretamente no Track Ofertas
              </p>
              
              {needsToPay && !hasPurchased && (
                <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/30">
                  <div className="flex items-center justify-center gap-2 text-accent">
                    <Coins className="h-4 w-4" />
                    <span className="font-semibold">{EXTENSION_COST.toFixed(2)} créditos</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Compra única - acesso vitalício</p>
                </div>
              )}

              <Button 
                onClick={handleDownload}
                disabled={isLoading || purchasing}
                className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-6 text-lg"
              >
                {purchasing ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Processando...
                  </>
                ) : needsToPay ? (
                  <>
                    <Lock className="h-5 w-5 mr-2" />
                    Comprar e Baixar
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5 mr-2" />
                    Baixar Extensão
                  </>
                )}
              </Button>
              
              {hasPurchased && (
                <p className="text-xs text-green-500 mt-2 flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Você já possui acesso a esta extensão
                </p>
              )}
            </CardContent>
          </Card>

          {/* Features */}
          <Card className="border-2 border-accent mb-8">
            <CardHeader>
              <CardTitle className="text-xl">✨ Funcionalidades</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Installation Instructions */}
          <Card className="border-2 border-accent mb-8">
            <CardHeader>
              <CardTitle className="text-xl">📖 Como Instalar</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {instructions.map((instruction, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-accent-foreground">{index + 1}</span>
                    </div>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Usage Info */}
          <Card className="border-2 border-accent">
            <CardHeader>
              <CardTitle className="text-xl">💡 Como Usar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Após instalar a extensão e fazer login com sua conta Zapdata, acesse a{" "}
                <a 
                  href="https://www.facebook.com/ads/library" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Biblioteca de Anúncios do Facebook
                </a>
                .
              </p>
              <p>
                A extensão irá adicionar um botão <strong>"Salvar Oferta"</strong> em cada card de anúncio. 
                Ao clicar, você poderá dar um nome para a oferta e ela será salva automaticamente no seu Track Ofertas.
              </p>
              <p className="text-muted-foreground text-sm">
                Você pode usar os filtros da extensão para encontrar apenas anúncios relacionados a WhatsApp.
              </p>
            </CardContent>
          </Card>

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>

      <InsufficientCreditsModal
        open={showInsufficientCredits}
        onOpenChange={setShowInsufficientCredits}
        requiredCredits={EXTENSION_COST}
        systemName="Extensão Ads WhatsApp"
      />
    </>
  );
};

export default ExtensaoAdsWhatsApp;
