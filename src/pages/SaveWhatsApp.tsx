import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Chrome, FolderOpen, ToggleRight, CheckCircle } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import { useActivityTracker } from "@/hooks/useActivityTracker";

const SaveWhatsApp = () => {
  useActivityTracker("page_visit", "Save WhatsApp");
  
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
          <div className="flex justify-center mb-12">
            <a href="/save-whatsapp.zip" download>
              <Button size="lg" className="bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white gap-2 text-lg px-8 py-6">
                <Download className="w-6 h-6" />
                Baixar Extensão
              </Button>
            </a>
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
    </>
  );
};

export default SaveWhatsApp;
