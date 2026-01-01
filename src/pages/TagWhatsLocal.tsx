import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Monitor, Apple } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useEffect } from "react";

const TagWhatsLocal = () => {
  useActivityTracker("page_visit", "Tag Whats - Local");
  const navigate = useNavigate();

  // Load VTURB optimization script
  useEffect(() => {
    // Create optimization script
    const optimizationScript = document.createElement("script");
    optimizationScript.innerHTML = `!function(i,n){i._plt=i._plt||(n&&n.timeOrigin?n.timeOrigin+n.now():Date.now())}(window,performance);`;
    document.head.appendChild(optimizationScript);

    // Create preload links
    const preloadPlayer = document.createElement("link");
    preloadPlayer.rel = "preload";
    preloadPlayer.href = "https://scripts.converteai.net/574be7f8-d9bf-450a-9bfb-e024758a6c13/players/693ddbc2b50e82e7e2e1a233/v4/player.js";
    preloadPlayer.as = "script";
    document.head.appendChild(preloadPlayer);

    const preloadSmartplayer = document.createElement("link");
    preloadSmartplayer.rel = "preload";
    preloadSmartplayer.href = "https://scripts.converteai.net/lib/js/smartplayer-wc/v4/smartplayer.js";
    preloadSmartplayer.as = "script";
    document.head.appendChild(preloadSmartplayer);

    const preloadMedia = document.createElement("link");
    preloadMedia.rel = "preload";
    preloadMedia.href = "https://cdn.converteai.net/574be7f8-d9bf-450a-9bfb-e024758a6c13/693ddbbdab5e2b2053401541/main.m3u8";
    preloadMedia.as = "fetch";
    document.head.appendChild(preloadMedia);

    // DNS prefetch
    const dnsPrefetchCdn = document.createElement("link");
    dnsPrefetchCdn.rel = "dns-prefetch";
    dnsPrefetchCdn.href = "https://cdn.converteai.net";
    document.head.appendChild(dnsPrefetchCdn);

    const dnsPrefetchScripts = document.createElement("link");
    dnsPrefetchScripts.rel = "dns-prefetch";
    dnsPrefetchScripts.href = "https://scripts.converteai.net";
    document.head.appendChild(dnsPrefetchScripts);

    const dnsPrefetchImages = document.createElement("link");
    dnsPrefetchImages.rel = "dns-prefetch";
    dnsPrefetchImages.href = "https://images.converteai.net";
    document.head.appendChild(dnsPrefetchImages);

    const dnsPrefetchApi = document.createElement("link");
    dnsPrefetchApi.rel = "dns-prefetch";
    dnsPrefetchApi.href = "https://api.vturb.com.br";
    document.head.appendChild(dnsPrefetchApi);

    // Load VTURB player script
    const playerScript = document.createElement("script");
    playerScript.src = "https://scripts.converteai.net/574be7f8-d9bf-450a-9bfb-e024758a6c13/players/693ddbc2b50e82e7e2e1a233/v4/player.js";
    playerScript.async = true;
    document.head.appendChild(playerScript);

    return () => {
      // Cleanup scripts on unmount
      document.head.removeChild(optimizationScript);
      document.head.removeChild(preloadPlayer);
      document.head.removeChild(preloadSmartplayer);
      document.head.removeChild(preloadMedia);
      document.head.removeChild(dnsPrefetchCdn);
      document.head.removeChild(dnsPrefetchScripts);
      document.head.removeChild(dnsPrefetchImages);
      document.head.removeChild(dnsPrefetchApi);
      document.head.removeChild(playerScript);
    };
  }, []);

  const handleWindowsDownload = () => {
    window.open("https://joaolucassps.co/Tag%20Whats%20Setup%201.0.0.zip", "_blank");
  };

  const handleMacDownload = () => {
    window.open("https://joaolucassps.co/Tag-Whats-1.0.0-arm64.dmg.zip", "_blank");
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/tag-whats")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">📲 Tutorial de Uso</h1>
            <p className="text-muted-foreground">
              Aprenda a usar o Tag Whats com o tutorial abaixo
            </p>
          </header>

          {/* Video Container */}
          <Card className="border-2 border-accent mb-8">
            <CardContent className="p-4 md:p-6">
              <div 
                className="w-full"
                dangerouslySetInnerHTML={{
                  __html: '<vturb-smartplayer id="vid-693ddbc2b50e82e7e2e1a233" style="display: block; margin: 0 auto; width: 100%;"></vturb-smartplayer>'
                }}
              />
            </CardContent>
          </Card>

          {/* Download Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Windows Card */}
            <Card className="border-2 border-accent hover:border-accent/80 transition-colors">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-2">
                  <Monitor className="h-8 w-8 text-accent" />
                </div>
                <CardTitle className="text-xl">Windows</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground mb-4">
                  Baixe a versão para Windows
                </p>
                <Button 
                  onClick={handleWindowsDownload}
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar para Windows
                </Button>
              </CardContent>
            </Card>

            {/* macOS Card */}
            <Card className="border-2 border-accent hover:border-accent/80 transition-colors">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-2">
                  <Apple className="h-8 w-8 text-accent" />
                </div>
                <CardTitle className="text-xl">macOS</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground mb-4">
                  Baixe a versão para macOS
                </p>
                <Button 
                  onClick={handleMacDownload}
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar para macOS
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

export default TagWhatsLocal;
