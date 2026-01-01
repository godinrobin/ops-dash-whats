import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Monitor, Cloud, Download, Zap, Power, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActivityTracker } from "@/hooks/useActivityTracker";

const TagWhatsSelect = () => {
  useActivityTracker("page_visit", "Tag Whats - Seleção");
  const navigate = useNavigate();

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-5xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <header className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">🏷️ Tag Whats</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Marque automaticamente seus comprovantes de pagamento PIX com a etiqueta "Pago" no WhatsApp Business
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Versão Local */}
            <Card 
              className="border-2 border-blue-500/30 hover:border-blue-500/60 transition-all cursor-pointer group bg-gradient-to-br from-blue-500/5 to-blue-600/10"
              onClick={() => navigate("/tag-whats/local")}
            >
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Monitor className="h-10 w-10 text-blue-500" />
                </div>
                <CardTitle className="text-2xl text-blue-400">Versão Local</CardTitle>
                <CardDescription className="text-base">
                  Baixe o programa direto no computador para etiquetar vendas automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-400 flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4" />
                    Benefícios
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-1">•</span>
                      Não precisa escanear QR Code em nenhum servidor
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-1">•</span>
                      Funciona apenas localmente no seu computador
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-1">•</span>
                      Total privacidade dos seus dados
                    </li>
                  </ul>
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  <Download className="h-4 w-4 mr-2" />
                  Acessar Versão Local
                </Button>
              </CardContent>
            </Card>

            {/* Versão em Nuvem */}
            <Card 
              className="border-2 border-emerald-500/30 hover:border-emerald-500/60 transition-all cursor-pointer group bg-gradient-to-br from-emerald-500/5 to-emerald-600/10"
              onClick={() => navigate("/tag-whats/cloud")}
            >
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Cloud className="h-10 w-10 text-emerald-500" />
                </div>
                <CardTitle className="text-2xl text-emerald-400">Versão em Nuvem</CardTitle>
                <CardDescription className="text-base">
                  Escaneie o QR Code e a cada comprovante recebido, marque automaticamente como pago
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                  <h4 className="font-semibold text-emerald-400 flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4" />
                    Benefícios
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 mt-1">•</span>
                      Roda 24 horas por dia com o PC desligado
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 mt-1">•</span>
                      Processa imagens e PDFs automaticamente
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 mt-1">•</span>
                      IA identifica comprovantes PIX instantaneamente
                    </li>
                  </ul>
                </div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <Power className="h-4 w-4 mr-2" />
                  Acessar Versão em Nuvem
                </Button>
              </CardContent>
            </Card>
          </div>

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default TagWhatsSelect;
