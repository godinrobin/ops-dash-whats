import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Upload, 
  Trash2, 
  Play, 
  Download, 
  FileVideo, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  Archive,
  Eye
} from "lucide-react";

interface VideoClip {
  id: string;
  file: File;
  url: string;
  name: string;
}

interface GeneratedVideo {
  id: string;
  renderId: string;
  name: string;
  status: 'queued' | 'rendering' | 'done' | 'failed';
  url?: string;
}

const MAX_VIDEO_DURATION_MINUTES = 4;

export default function VideoVariationGenerator() {
  const { user } = useAuth();
  const [hookVideos, setHookVideos] = useState<VideoClip[]>([]);
  const [bodyVideos, setBodyVideos] = useState<VideoClip[]>([]);
  const [ctaVideos, setCtaVideos] = useState<VideoClip[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const totalVariations = hookVideos.length * bodyVideos.length * ctaVideos.length;
  const estimatedTimeMinutes = totalVariations * 2; // ~2 min per video

  const uploadVideo = async (file: File, section: 'hook' | 'body' | 'cta') => {
    if (!user) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${section}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('video-clips')
      .upload(fileName, file);

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    const { data: urlData } = supabase.storage
      .from('video-clips')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  const handleFileUpload = async (
    files: FileList | null,
    section: 'hook' | 'body' | 'cta',
    setVideos: React.Dispatch<React.SetStateAction<VideoClip[]>>
  ) => {
    if (!files) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('video/')) {
          toast.error(`${file.name} não é um vídeo válido`);
          continue;
        }

        const url = await uploadVideo(file, section);
        if (url) {
          setVideos(prev => [...prev, {
            id: Date.now().toString() + Math.random(),
            file,
            url,
            name: file.name
          }]);
        }
      }
      toast.success('Vídeos adicionados com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload dos vídeos');
    } finally {
      setIsUploading(false);
    }
  };

  const removeVideo = (id: string, setVideos: React.Dispatch<React.SetStateAction<VideoClip[]>>) => {
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  const generateVariations = async () => {
    if (hookVideos.length === 0 || bodyVideos.length === 0 || ctaVideos.length === 0) {
      toast.error('Adicione pelo menos um vídeo em cada seção');
      return;
    }

    setIsGenerating(true);
    setGeneratedVideos([]);

    try {
      // Generate all variation combinations
      const variations: { hookIndex: number; bodyIndex: number; ctaIndex: number; name: string }[] = [];
      
      for (let h = 0; h < hookVideos.length; h++) {
        for (let b = 0; b < bodyVideos.length; b++) {
          for (let c = 0; c < ctaVideos.length; c++) {
            variations.push({
              hookIndex: h,
              bodyIndex: b,
              ctaIndex: c,
              name: `Hook${h + 1}_Corpo${b + 1}_CTA${c + 1}`
            });
          }
        }
      }

      const { data, error } = await supabase.functions.invoke('generate-video-variations', {
        body: {
          action: 'render',
          variations,
          hookVideos: hookVideos.map(v => v.url),
          bodyVideos: bodyVideos.map(v => v.url),
          ctaVideos: ctaVideos.map(v => v.url)
        }
      });

      if (error) throw error;

      if (data.success && data.renders) {
        const newVideos: GeneratedVideo[] = data.renders.map((r: any) => ({
          id: r.renderId || Date.now().toString(),
          renderId: r.renderId,
          name: r.name,
          status: r.status === 'failed' ? 'failed' : 'queued'
        }));
        setGeneratedVideos(newVideos);
        toast.success(`${variations.length} variações enviadas para geração!`);
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Erro ao gerar variações');
    } finally {
      setIsGenerating(false);
    }
  };

  const checkVideoStatus = useCallback(async (renderId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-video-variations', {
        body: { action: 'status', renderId }
      });

      if (error) throw error;

      if (data.success) {
        setGeneratedVideos(prev => prev.map(v => 
          v.renderId === renderId 
            ? { ...v, status: data.status, url: data.url }
            : v
        ));
      }
    } catch (error) {
      console.error('Status check error:', error);
    }
  }, []);

  // Poll for status updates
  useEffect(() => {
    const pendingVideos = generatedVideos.filter(v => 
      v.status === 'queued' || v.status === 'rendering'
    );

    if (pendingVideos.length === 0) return;

    const interval = setInterval(() => {
      pendingVideos.forEach(v => checkVideoStatus(v.renderId));
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [generatedVideos, checkVideoStatus]);

  const downloadVideo = async (url: string, name: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${name}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Erro ao baixar vídeo');
    }
  };

  const downloadAllAsZip = async () => {
    const completedVideos = generatedVideos.filter(v => v.status === 'done' && v.url);
    if (completedVideos.length === 0) {
      toast.error('Nenhum vídeo disponível para download');
      return;
    }

    toast.info('Preparando download... isso pode levar alguns segundos');
    
    // For now, download each video individually
    // In production, you'd use a library like JSZip
    for (const video of completedVideos) {
      if (video.url) {
        await downloadVideo(video.url, video.name);
      }
    }
  };

  const VideoSection = ({ 
    title, 
    videos, 
    setVideos, 
    section,
    color
  }: { 
    title: string; 
    videos: VideoClip[]; 
    setVideos: React.Dispatch<React.SetStateAction<VideoClip[]>>;
    section: 'hook' | 'body' | 'cta';
    color: string;
  }) => (
    <Card className="bg-background/95 border-2 border-accent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className={`w-3 h-3 rounded-full ${color}`} />
          {title}
          <Badge variant="secondary" className="ml-auto">
            {videos.length} vídeo(s)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center">
          <Input
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            id={`upload-${section}`}
            onChange={(e) => handleFileUpload(e.target.files, section, setVideos)}
            disabled={isUploading}
          />
          <Label 
            htmlFor={`upload-${section}`} 
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            {isUploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              Clique ou arraste vídeos aqui
            </span>
          </Label>
        </div>

        {videos.length > 0 && (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {videos.map((video) => (
              <div 
                key={video.id}
                className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
              >
                <FileVideo className="h-5 w-5 text-accent" />
                <span className="text-sm truncate flex-1">{video.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPreviewVideo(video.url)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeVideo(video.id, setVideos)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const completedCount = generatedVideos.filter(v => v.status === 'done').length;
  const failedCount = generatedVideos.filter(v => v.status === 'failed').length;
  const pendingCount = generatedVideos.filter(v => v.status === 'queued' || v.status === 'rendering').length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              🎬 Gerador de Variações de Vídeo
            </h1>
            <p className="text-muted-foreground">
              Crie múltiplas variações de anúncios combinando diferentes hooks, corpos e CTAs
            </p>
            <p className="text-sm text-accent mt-2">
              ⚠️ Tempo máximo por vídeo: {MAX_VIDEO_DURATION_MINUTES} minutos
            </p>
          </div>

          {/* Upload Sections */}
          <div className="grid md:grid-cols-3 gap-4">
            <VideoSection 
              title="Hook (Início)" 
              videos={hookVideos} 
              setVideos={setHookVideos}
              section="hook"
              color="bg-green-500"
            />
            <VideoSection 
              title="Corpo (Meio)" 
              videos={bodyVideos} 
              setVideos={setBodyVideos}
              section="body"
              color="bg-blue-500"
            />
            <VideoSection 
              title="CTA (Final)" 
              videos={ctaVideos} 
              setVideos={setCtaVideos}
              section="cta"
              color="bg-purple-500"
            />
          </div>

          {/* Stats and Generate Button */}
          <Card className="bg-background/95 border-2 border-accent">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <FileVideo className="h-4 w-4 text-accent" />
                    <span>Total de variações: <strong>{totalVariations}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Tempo estimado: <strong>~{estimatedTimeMinutes} min</strong></span>
                  </div>
                </div>
                <Button
                  onClick={generateVariations}
                  disabled={isGenerating || totalVariations === 0}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Gerar {totalVariations} Variações
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Generated Videos */}
          {generatedVideos.length > 0 && (
            <Card className="bg-background/95 border-2 border-accent">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Vídeos Gerados</span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{completedCount}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-accent" />
                      <span>{pendingCount}</span>
                    </div>
                    {failedCount > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span>{failedCount}</span>
                      </div>
                    )}
                    {completedCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadAllAsZip}
                        className="border-accent"
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Baixar Todos
                      </Button>
                    )}
                  </div>
                </CardTitle>
                {pendingCount > 0 && (
                  <Progress 
                    value={(completedCount / generatedVideos.length) * 100} 
                    className="h-2"
                  />
                )}
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto">
                  {generatedVideos.map((video) => (
                    <div 
                      key={video.id}
                      className="p-4 bg-muted/50 rounded-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{video.name}</span>
                        {video.status === 'done' && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {video.status === 'failed' && (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        {(video.status === 'queued' || video.status === 'rendering') && (
                          <Loader2 className="h-4 w-4 animate-spin text-accent" />
                        )}
                      </div>
                      <Badge 
                        variant={
                          video.status === 'done' ? 'default' :
                          video.status === 'failed' ? 'destructive' : 'secondary'
                        }
                      >
                        {video.status === 'queued' && 'Na fila'}
                        {video.status === 'rendering' && 'Renderizando'}
                        {video.status === 'done' && 'Concluído'}
                        {video.status === 'failed' && 'Falhou'}
                      </Badge>
                      {video.status === 'done' && video.url && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewVideo(video.url!)}
                            className="flex-1"
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            Preview
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadVideo(video.url!, video.name)}
                            className="flex-1 border-accent"
                          >
                            <Download className="mr-1 h-3 w-3" />
                            Baixar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Video Preview Modal */}
      <Dialog open={!!previewVideo} onOpenChange={() => setPreviewVideo(null)}>
        <DialogContent className="max-w-4xl bg-background border-2 border-accent">
          <DialogHeader>
            <DialogTitle>Preview do Vídeo</DialogTitle>
          </DialogHeader>
          {previewVideo && (
            <video 
              src={previewVideo} 
              controls 
              className="w-full rounded-lg"
              autoPlay
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
