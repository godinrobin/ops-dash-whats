import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Chrome, FolderOpen, ToggleRight, CheckCircle, Lock, Coins } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { useCredits } from "@/hooks/useCredits";
import { InsufficientCreditsModal } from "@/components/credits/InsufficientCreditsModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const EXTENSION_COST = 1.50;
const SYSTEM_ID = 'save_whatsapp';

const SaveWhatsApp = () => {
  useActivityTracker("page_visit", "Save WhatsApp");
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
          'Compra da Extensão Save WhatsApp'
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
    window.open("https://joaolucassps.co/save-whatsapp.zip", "_blank");
  };
  
  const steps = [
    {
      icon: Download,
      title: "1. Baixe a extensão",
      description: "Clique no botão abaixo para baixar o arquivo save-whatsapp.zip"
    },
    {
      icon: FolderOpen,
      title: "2. Extraia o arquivo",
      description: "Descompacte o arquivo ZIP em uma pasta no seu computador"
    },
    {
      icon: Chrome,
      title: "3. Acesse as extensões do Chrome",
      description: "Digite chrome://extensions na barra de endereços e pressione Enter"
    },
    {
      icon: ToggleRight,
      title: "4. Ative o modo desenvolvedor",
      description: "No canto superior direito, ative a opção 'Modo do desenvolvedor'"
    },
    {
      icon: FolderOpen,
      title: "5. Carregue a extensão",
      description: "Clique em 'Carregar sem compactação' e selecione a pasta extraída"
    },
    {
      icon: CheckCircle,
      title: "6. Pronto!",
      description: "A extensão está instalada. Acesse o WhatsApp Web para usar"
    }
  ];

  const isLoading = creditsLoading || balanceLoading || checkingPurchase;
  const needsToPay = isSemiFullMember && !hasPurchased;

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-4xl">
          <header className="text-center mb-12">
            <div className="flex justify-center mb-4">
              <img src={whatsappLogo} alt="WhatsApp" className="w-20 h-20 object-contain" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              Save WhatsApp
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Extensão para salvar todos os seus contatos do WhatsApp de forma rápida e organizada
            </p>
          </header>

          {/* Download Button */}
          <div className="flex flex-col items-center mb-12">
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
              size="lg" 
              onClick={handleDownload}
              disabled={isLoading || purchasing}
              className="bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white gap-2 text-lg px-8 py-6"
            >
              {purchasing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Processando...
                </>
              ) : needsToPay ? (
                <>
                  <Lock className="w-6 h-6" />
                  Comprar e Baixar
                </>
              ) : (
                <>
                  <Download className="w-6 h-6" />
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
          </div>

          {/* Features */}
          <Card className="mb-12 border-2 border-green-500/30">
            <CardHeader>
              <CardTitle className="text-2xl text-center">O que a extensão faz?</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Salva todos os contatos do WhatsApp Web em poucos cliques</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Exporta os contatos em formato organizado (CSV, TXT)</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Funciona diretamente no navegador Chrome</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Sem necessidade de login ou cadastro adicional</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Installation Steps */}
          <div>
            <h2 className="text-2xl font-bold text-center mb-8">Como instalar</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {steps.map((step, index) => (
                <Card key={index} className="border-accent/30 hover:border-green-500/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <step.icon className="w-5 h-5 text-green-500" />
                      </div>
                      <CardTitle className="text-base">{step.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm">
                      {step.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      <InsufficientCreditsModal
        open={showInsufficientCredits}
        onOpenChange={setShowInsufficientCredits}
        requiredCredits={EXTENSION_COST}
        systemName="Save WhatsApp"
      />
    </>
  );
};

export default SaveWhatsApp;
