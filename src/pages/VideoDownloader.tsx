import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, Video, Music, Youtube, Instagram, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Platform detection patterns
const PLATFORM_PATTERNS: Record<string, RegExp> = {
  youtube: /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  tiktok: /(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/|tiktok\.com\/t\/|vt\.tiktok\.com\/)(\w+)/i,
  instagram: /(?:instagram\.com\/(?:p|reel|reels|tv)\/)([\w-]+)/i,
  twitter: /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
  facebook: /(?:facebook\.com|fb\.watch)\/(?:watch\/?\?v=|reel\/|[\w.]+\/videos\/)(\d+)?/i,
};

const PLATFORM_INFO: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
  youtube: { name: "YouTube", icon: <Youtube className="w-5 h-5" />, color: "text-red-500" },
  tiktok: { name: "TikTok", icon: <span className="text-lg">🎵</span>, color: "text-pink-500" },
  instagram: { name: "Instagram", icon: <Instagram className="w-5 h-5" />, color: "text-purple-500" },
  twitter: { name: "Twitter/X", icon: <span className="text-lg">𝕏</span>, color: "text-foreground" },
  facebook: { name: "Facebook", icon: <span className="text-lg">📘</span>, color: "text-blue-500" },
};

function detectPlatform(url: string): string | null {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) {
      return platform;
    }
  }
  return null;
}

const VideoDownloader = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [downloadMode, setDownloadMode] = useState<"auto" | "audio">("auto");
  const [videoQuality, setVideoQuality] = useState("1080");
  const [isLoading, setIsLoading] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    const platform = detectPlatform(value);
    setDetectedPlatform(platform);
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Cole o link do vídeo que deseja baixar",
        variant: "destructive",
      });
      return;
    }

    if (!detectedPlatform) {
      toast({
        title: "Plataforma não suportada",
        description: "Use links do YouTube, TikTok, Instagram, Twitter ou Facebook",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("video-downloader", {
        body: { url, downloadMode, videoQuality },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || "Erro ao processar download");
      }

      // Open download URL in new tab
      window.open(data.url, "_blank");

      toast({
        title: "Download iniciado!",
        description: data.title || "O download será iniciado em uma nova aba",
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

  const platformInfo = detectedPlatform ? PLATFORM_INFO[detectedPlatform] : null;

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
                <span className="text-6xl">⬇️</span>
              </div>
              <CardTitle className="text-2xl md:text-3xl bg-gradient-to-r from-red-500 to-pink-500 bg-clip-text text-transparent">
                Downloader de Vídeos
              </CardTitle>
              <CardDescription className="text-base">
                Baixe vídeos do YouTube, TikTok, Instagram, Twitter e Facebook
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
                    placeholder="Cole o link do vídeo aqui..."
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="pr-12"
                  />
                  {platformInfo && (
                    <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${platformInfo.color}`}>
                      {platformInfo.icon}
                    </div>
                  )}
                </div>
                {platformInfo && (
                  <p className={`text-sm ${platformInfo.color}`}>
                    {platformInfo.name} detectado
                  </p>
                )}
              </div>

              {/* Format Selection */}
              <div className="grid grid-cols-2 gap-4">
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
                          Vídeo (MP4)
                        </div>
                      </SelectItem>
                      <SelectItem value="audio">
                        <div className="flex items-center gap-2">
                          <Music className="w-4 h-4" />
                          Áudio (MP3)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Qualidade</Label>
                  <Select value={videoQuality} onValueChange={setVideoQuality} disabled={downloadMode === "audio"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="360">360p</SelectItem>
                      <SelectItem value="480">480p</SelectItem>
                      <SelectItem value="720">720p (HD)</SelectItem>
                      <SelectItem value="1080">1080p (Full HD)</SelectItem>
                      <SelectItem value="max">Máxima</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Download Button */}
              <Button
                onClick={handleDownload}
                disabled={isLoading || !url.trim()}
                className="w-full h-12 text-lg bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Baixar
                  </>
                )}
              </Button>

              {/* Supported Platforms */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground text-center mb-3">
                  Plataformas suportadas
                </p>
                <div className="flex justify-center gap-6">
                  {Object.entries(PLATFORM_INFO).map(([key, info]) => (
                    <div
                      key={key}
                      className={`flex flex-col items-center gap-1 ${info.color} opacity-70`}
                    >
                      {info.icon}
                      <span className="text-xs">{info.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="mt-6 bg-muted/50">
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">💡 Dicas</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Cole o link completo do vídeo</li>
                <li>• O vídeo precisa estar público</li>
                <li>• Alguns vídeos podem não estar disponíveis por restrições da plataforma</li>
                <li>• Para TikTok, o vídeo será baixado sem marca d'água</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default VideoDownloader;