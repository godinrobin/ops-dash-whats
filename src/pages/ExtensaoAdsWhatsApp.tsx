import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Chrome, CheckCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";

const ExtensaoAdsWhatsApp = () => {
  useActivityTracker("page_visit", "Extensão Ads WhatsApp");
  const navigate = useNavigate();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const cacheBust = Date.now();
      let zipVersion = "";

      const extensionFiles = [
        "background.js",
        "content.css",
        "content.js",
        "manifest.json",
        "popup.css",
        "popup.html",
        "popup.js",
        "icons/icon128.png",
        "icons/icon16.svg",
        "icons/icon48.svg",
        "icons/icon128.svg",
      ];

      for (const file of extensionFiles) {
        try {
          const response = await fetch(`/chrome-extension/${file}?v=${cacheBust}`, {
            cache: "no-store",
          });
          if (!response.ok) continue;

          // For manifest.json, keep as text so we can read the version and bust browser caches reliably.
          if (file === "manifest.json") {
            const text = await response.text();
            zip.file(file, text);
            try {
              const parsed = JSON.parse(text);
              if (typeof parsed?.version === "string") zipVersion = parsed.version;
            } catch {
              // ignore
            }
            continue;
          }

          const content = await response.blob();
          zip.file(file, content);
        } catch (error) {
          console.warn(`Could not fetch ${file}:`, error);
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipVersion ? `FB-ADS-ZAPDATA-v${zipVersion}.zip` : "FB-ADS-ZAPDATA.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download iniciado!");
    } catch (error) {
      console.error("Error creating ZIP:", error);
      toast.error("Erro ao baixar extensão. Tente novamente.");
    } finally {
      setIsDownloading(false);
    }
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
              <Button 
                onClick={handleDownload}
                disabled={isDownloading}
                className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-6 text-lg"
              >
                {isDownloading ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Download className="h-5 w-5 mr-2" />
                )}
                {isDownloading ? "Baixando..." : "Baixar Extensão"}
              </Button>
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
    </>
  );
};

export default ExtensaoAdsWhatsApp;
