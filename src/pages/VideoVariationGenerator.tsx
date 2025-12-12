import { useState, useEffect, useRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
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
  Eye,
  Pause
} from "lucide-react";

interface VideoClip {
  id: string;
  file: File;
  url: string;
  name: string;
}

interface GeneratedVideo {
  id: string;
  name: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  url?: string;
  blob?: Blob;
}

const MAX_VIDEO_DURATION_MINUTES = 4;

export default function VideoVariationGenerator() {
  const { user } = useAuth();
  const [hookVideos, setHookVideos] = useState<VideoClip[]>([]);
  const [bodyVideos, setBodyVideos] = useState<VideoClip[]>([]);
  const [ctaVideos, setCtaVideos] = useState<VideoClip[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [currentProcessing, setCurrentProcessing] = useState<string | null>(null);
  
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const pauseRef = useRef(false);

  const totalVariations = hookVideos.length * bodyVideos.length * ctaVideos.length;
  const estimatedTimeSeconds = totalVariations * 30; // ~30 sec per video locally

  // Load FFmpeg on mount
  useEffect(() => {
    const loadFFmpeg = async () => {
      if (ffmpegRef.current || ffmpegLoading) return;
      
      setFfmpegLoading(true);
      try {
        const ffmpeg = new FFmpeg();
        
        ffmpeg.on("progress", ({ progress }) => {
          setLoadingProgress(Math.round(progress * 100));
        });

        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });

        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
        toast.success("FFmpeg carregado com sucesso!");
      } catch (error) {
        console.error("Error loading FFmpeg:", error);
        toast.error("Erro ao carregar FFmpeg. Tente recarregar a página.");
      } finally {
        setFfmpegLoading(false);
      }
    };

    loadFFmpeg();
  }, []);

  // Sync pause state with ref
  useEffect(() => {
    pauseRef.current = isPaused;
  }, [isPaused]);

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

        const url = URL.createObjectURL(file);
        setVideos(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          file,
          url,
          name: file.name
        }]);
      }
      toast.success('Vídeos adicionados com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao adicionar vídeos');
    } finally {
      setIsUploading(false);
    }
  };

  const removeVideo = (id: string, setVideos: React.Dispatch<React.SetStateAction<VideoClip[]>>) => {
    setVideos(prev => {
      const video = prev.find(v => v.id === id);
      if (video) {
        URL.revokeObjectURL(video.url);
      }
      return prev.filter(v => v.id !== id);
    });
  };

  const concatenateVideos = async (
    hookFile: File,
    bodyFile: File,
    ctaFile: File,
    outputName: string
  ): Promise<Blob | null> => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return null;

    try {
      // Write input files to FFmpeg virtual filesystem
      await ffmpeg.writeFile("hook.mp4", await fetchFile(hookFile));
      await ffmpeg.writeFile("body.mp4", await fetchFile(bodyFile));
      await ffmpeg.writeFile("cta.mp4", await fetchFile(ctaFile));

      // Create concat list file
      const concatList = "file 'hook.mp4'\nfile 'body.mp4'\nfile 'cta.mp4'";
      await ffmpeg.writeFile("list.txt", concatList);

      // Execute concatenation with re-encoding for compatibility
      await ffmpeg.exec([
        "-f", "concat",
        "-safe", "0",
        "-i", "list.txt",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "output.mp4"
      ]);

      // Read output file
      const data = await ffmpeg.readFile("output.mp4");
      const uint8Array = new Uint8Array(data as Uint8Array);
      const blob = new Blob([uint8Array], { type: "video/mp4" });

      // Cleanup
      await ffmpeg.deleteFile("hook.mp4");
      await ffmpeg.deleteFile("body.mp4");
      await ffmpeg.deleteFile("cta.mp4");
      await ffmpeg.deleteFile("list.txt");
      await ffmpeg.deleteFile("output.mp4");

      return blob;
    } catch (error) {
      console.error("Concatenation error:", error);
      return null;
    }
  };

  const generateVariations = async () => {
    if (!ffmpegLoaded) {
      toast.error("FFmpeg ainda está carregando. Aguarde.");
      return;
    }

    if (hookVideos.length === 0 || bodyVideos.length === 0 || ctaVideos.length === 0) {
      toast.error('Adicione pelo menos um vídeo em cada seção');
      return;
    }

    setIsGenerating(true);
    setIsPaused(false);
    pauseRef.current = false;

    // Generate all variation combinations
    const variations: { hook: VideoClip; body: VideoClip; cta: VideoClip; name: string }[] = [];
    
    for (let h = 0; h < hookVideos.length; h++) {
      for (let b = 0; b < bodyVideos.length; b++) {
        for (let c = 0; c < ctaVideos.length; c++) {
          variations.push({
            hook: hookVideos[h],
            body: bodyVideos[b],
            cta: ctaVideos[c],
            name: `Hook${h + 1}_Corpo${b + 1}_CTA${c + 1}`
          });
        }
      }
    }

    // Initialize all videos as queued
    const initialVideos: GeneratedVideo[] = variations.map((v, i) => ({
      id: `video-${i}-${Date.now()}`,
      name: v.name,
      status: 'queued'
    }));
    setGeneratedVideos(initialVideos);

    // Process each variation sequentially
    for (let i = 0; i < variations.length; i++) {
      // Check if paused
      while (pauseRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const variation = variations[i];
      setCurrentProcessing(variation.name);

      // Update status to processing
      setGeneratedVideos(prev => prev.map((v, idx) => 
        idx === i ? { ...v, status: 'processing' } : v
      ));

      try {
        const blob = await concatenateVideos(
          variation.hook.file,
          variation.body.file,
          variation.cta.file,
          variation.name
        );

        if (blob) {
          const url = URL.createObjectURL(blob);
          setGeneratedVideos(prev => prev.map((v, idx) => 
            idx === i ? { ...v, status: 'done', url, blob } : v
          ));
        } else {
          setGeneratedVideos(prev => prev.map((v, idx) => 
            idx === i ? { ...v, status: 'failed' } : v
          ));
        }
      } catch (error) {
        console.error(`Error processing ${variation.name}:`, error);
        setGeneratedVideos(prev => prev.map((v, idx) => 
          idx === i ? { ...v, status: 'failed' } : v
        ));
      }
    }

    setCurrentProcessing(null);
    setIsGenerating(false);
    toast.success("Todas as variações foram processadas!");
  };

  const downloadVideo = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllAsZip = async () => {
    const completedVideos = generatedVideos.filter(v => v.status === 'done' && v.url);
    if (completedVideos.length === 0) {
      toast.error('Nenhum vídeo disponível para download');
      return;
    }

    toast.info('Baixando vídeos...');
    
    for (const video of completedVideos) {
      if (video.url) {
        downloadVideo(video.url, video.name);
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between downloads
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
            disabled={isUploading || isGenerating}
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
                  disabled={isGenerating}
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
  const pendingCount = generatedVideos.filter(v => v.status === 'queued' || v.status === 'processing').length;

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
              ⚠️ Processamento local no navegador - mantenha a aba aberta
            </p>
          </div>

          {/* FFmpeg Loading Status */}
          {!ffmpegLoaded && (
            <Card className="bg-background/95 border-2 border-accent">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Carregando FFmpeg...</p>
                    <p className="text-xs text-muted-foreground">
                      Isso pode levar alguns segundos na primeira vez (~31MB)
                    </p>
                    {ffmpegLoading && (
                      <Progress value={loadingProgress} className="h-2 mt-2" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                    <span>Tempo estimado: <strong>~{Math.ceil(estimatedTimeSeconds / 60)} min</strong></span>
                  </div>
                </div>
                <Button
                  onClick={generateVariations}
                  disabled={isGenerating || totalVariations === 0 || !ffmpegLoaded}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando... {currentProcessing && `(${currentProcessing})`}
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
                <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                  <span>Vídeos Gerados</span>
                  <div className="flex items-center gap-4 flex-wrap">
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
                    {isGenerating && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsPaused(!isPaused)}
                        className={isPaused ? "border-green-500 text-green-500" : "border-destructive text-destructive"}
                      >
                        {isPaused ? (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Continuar
                          </>
                        ) : (
                          <>
                            <Pause className="mr-2 h-4 w-4" />
                            Pausar
                          </>
                        )}
                      </Button>
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
                        {(video.status === 'queued' || video.status === 'processing') && (
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
                        {video.status === 'processing' && 'Processando...'}
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
