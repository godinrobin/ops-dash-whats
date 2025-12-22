import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, Video, Music, ArrowLeft } from "lucide-react";
import tiktokLogo from "@/assets/tiktok-logo.png";
import { useNavigate } from "react-router-dom";
import { useActivityTracker } from "@/hooks/useActivityTracker";

// Platform detection pattern - only TikTok
const TIKTOK_PATTERN = /(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/|tiktok\.com\/t\/|vt\.tiktok\.com\/)(\w+)/i;

function isTikTokUrl(url: string): boolean {
  return TIKTOK_PATTERN.test(url);
}

const VideoDownloader = () => {
  useActivityTracker("page_visit", "Video Downloader TikTok");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [downloadMode, setDownloadMode] = useState<"auto" | "audio">("auto");
  const [isLoading, setIsLoading] = useState(false);
  const [isTikTok, setIsTikTok] = useState(false);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setIsTikTok(isTikTokUrl(value));
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Cole o link do vídeo do TikTok que deseja baixar",
        variant: "destructive",
      });
      return;
    }

    if (!isTikTok) {
      toast({
        title: "Link inválido",
        description: "Use apenas links do TikTok",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("video-downloader", {
        body: { url, downloadMode },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || "Erro ao processar download");
      }

      // Fetch the video/audio as blob and trigger real download
      toast({
        title: "Baixando...",
        description: "Aguarde enquanto preparamos seu arquivo",
      });

      const response = await fetch(data.url);
      if (!response.ok) {
        throw new Error("Erro ao baixar arquivo");
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = data.filename || (downloadMode === "audio" ? "tiktok-audio.mp3" : "tiktok-video.mp4");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up blob URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      toast({
        title: "Download concluído!",
        description: data.title || "Arquivo baixado com sucesso",
      });
    } catch (error: any) {
      console.error("Download error:", error);
      toast({
        title: "Erro no download",
        description: error.message || "Não foi possível baixar o vídeo",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="container mx-auto max-w-2xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>

          <Card className="border-2 border-accent">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <img src={tiktokLogo} alt="TikTok" className="w-20 h-20 object-contain" />
              </div>
              <CardTitle className="text-2xl md:text-3xl bg-gradient-to-r from-pink-500 to-cyan-400 bg-clip-text text-transparent">
                Download Vídeos TikTok
              </CardTitle>
              <CardDescription className="text-base">
                Baixe vídeos do TikTok sem marca d'água gratuitamente
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* URL Input */}
              <div className="space-y-2">
                <Label htmlFor="url">Link do Vídeo</Label>
                <div className="relative">
                  <Input
                    id="url"
                    type="url"
                    placeholder="Cole o link do TikTok aqui..."
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="pr-12"
                  />
                  {isTikTok && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-500">
                      <span className="text-lg">🎵</span>
                    </div>
                  )}
                </div>
                {isTikTok && (
                  <p className="text-sm text-pink-500">
                    TikTok detectado ✓
                  </p>
                )}
              </div>

              {/* Format Selection */}
              <div className="space-y-2">
                <Label>Formato</Label>
                <Select value={downloadMode} onValueChange={(v) => setDownloadMode(v as "auto" | "audio")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Vídeo (MP4) - Sem marca d'água
                      </div>
                    </SelectItem>
                    <SelectItem value="audio">
                      <div className="flex items-center gap-2">
                        <Music className="w-4 h-4" />
                        Apenas Áudio (MP3)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Download Button */}
              <Button
                onClick={handleDownload}
                disabled={isLoading || !url.trim() || !isTikTok}
                className="w-full h-12 text-lg bg-gradient-to-r from-pink-500 to-cyan-400 hover:from-pink-600 hover:to-cyan-500"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Baixando...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Baixar
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="mt-6 bg-muted/50">
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">💡 Como usar</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>1. Abra o TikTok e encontre o vídeo que deseja baixar</li>
                <li>2. Toque em "Compartilhar" e copie o link</li>
                <li>3. Cole o link aqui e clique em "Baixar"</li>
                <li>4. O vídeo será baixado sem marca d'água!</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default VideoDownloader;