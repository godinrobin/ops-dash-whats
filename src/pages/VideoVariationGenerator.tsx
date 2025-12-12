import { useState, useEffect, useRef } from "react";
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
import { supabase } from "@/integrations/supabase/client";
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
  Pause,
  Cloud
} from "lucide-react";

interface VideoClip {
  id: string;
  file: File;
  url: string;
  name: string;
  storageUrl?: string;
}

interface GeneratedVideo {
  id: string;
  name: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  url?: string;
  requestId?: string;
  responseUrl?: string;
}

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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentProcessing, setCurrentProcessing] = useState<string | null>(null);
  
  const pauseRef = useRef(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const totalVariations = hookVideos.length * bodyVideos.length * ctaVideos.length;
  const estimatedTimeSeconds = totalVariations * 60; // ~1 min per video on cloud

  useEffect(() => {
    pauseRef.current = isPaused;
  }, [isPaused]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const uploadVideoToStorage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    
    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    
    const { data, error } = await supabase.storage
      .from('video-clips')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('video-clips')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  const handleFileUpload = async (
    files: FileList | null,
    section: 'hook' | 'body' | 'cta',
    setVideos: React.Dispatch<React.SetStateAction<VideoClip[]>>
  ) => {
    if (!files || !user) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const fileArray = Array.from(files);
      let uploaded = 0;
      
      for (const file of fileArray) {
        if (!file.type.startsWith('video/')) {
          toast.error(`${file.name} não é um vídeo válido`);
          continue;
        }

        // Upload to Supabase Storage
        const storageUrl = await uploadVideoToStorage(file);
        
        if (!storageUrl) {
          toast.error(`Erro ao fazer upload de ${file.name}`);
          continue;
        }

        const localUrl = URL.createObjectURL(file);
        setVideos(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          file,
          url: localUrl,
          name: file.name,
          storageUrl
        }]);
        
        uploaded++;
        setUploadProgress((uploaded / fileArray.length) * 100);
      }
      
      toast.success('Vídeos enviados com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao adicionar vídeos');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
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

  const checkVideoStatus = async (requestId: string, responseUrl?: string): Promise<{ status: string; videoUrl?: string }> => {
    const { data, error } = await supabase.functions.invoke('check-fal-status', {
      body: { requestId, responseUrl }
    });

    if (error) {
      console.error('Status check error:', error);
      return { status: 'failed' };
    }

    return {
      status: data.status,
      videoUrl: data.videoUrl
    };
  };

  const generateVariations = async () => {
    if (hookVideos.length === 0 || bodyVideos.length === 0 || ctaVideos.length === 0) {
      toast.error('Adicione pelo menos um vídeo em cada seção');
      return;
    }

    // Check if all videos have storage URLs
    const allVideos = [...hookVideos, ...bodyVideos, ...ctaVideos];
    const missingUploads = allVideos.filter(v => !v.storageUrl);
    if (missingUploads.length > 0) {
      toast.error('Alguns vídeos ainda estão sendo enviados. Aguarde.');
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

    // Submit all jobs to Fal.ai
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
        const { data, error } = await supabase.functions.invoke('merge-videos', {
          body: {
            videoUrls: [
              variation.hook.storageUrl,
              variation.body.storageUrl,
              variation.cta.storageUrl
            ],
            variationName: variation.name
          }
        });

        if (error || !data?.success) {
          console.error('Error submitting job:', error || data?.error);
          setGeneratedVideos(prev => prev.map((v, idx) => 
            idx === i ? { ...v, status: 'failed' } : v
          ));
          continue;
        }

        // Store request ID and response URL for polling
        setGeneratedVideos(prev => prev.map((v, idx) => 
          idx === i ? { ...v, requestId: data.requestId, responseUrl: data.responseUrl } : v
        ));

      } catch (error) {
        console.error(`Error processing ${variation.name}:`, error);
        setGeneratedVideos(prev => prev.map((v, idx) => 
          idx === i ? { ...v, status: 'failed' } : v
        ));
      }
    }

    setCurrentProcessing(null);
    toast.info("Jobs enviados! Verificando status...");

    // Start polling for results
    startPolling();
  };

  const startPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      const pendingVideos = generatedVideos.filter(
        v => v.requestId && (v.status === 'processing' || v.status === 'queued')
      );

      if (pendingVideos.length === 0) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsGenerating(false);
        toast.success("Todas as variações foram processadas!");
        return;
      }

      for (const video of pendingVideos) {
        if (!video.requestId) continue;

        const result = await checkVideoStatus(video.requestId, video.responseUrl);
        
        if (result.status === 'done' && result.videoUrl) {
          setGeneratedVideos(prev => prev.map(v => 
            v.id === video.id ? { ...v, status: 'done', url: result.videoUrl } : v
          ));
        } else if (result.status === 'failed') {
          setGeneratedVideos(prev => prev.map(v => 
            v.id === video.id ? { ...v, status: 'failed' } : v
          ));
        }
      }
    }, 5000); // Poll every 5 seconds
  };

  // Re-start polling when generatedVideos changes
  useEffect(() => {
    if (isGenerating && generatedVideos.some(v => v.requestId && v.status === 'processing')) {
      startPolling();
    }
  }, [generatedVideos, isGenerating]);

  const downloadVideo = async (url: string, name: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${name}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
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

    toast.info('Baixando vídeos...');
    
    for (const video of completedVideos) {
      if (video.url) {
        await downloadVideo(video.url, video.name);
        await new Promise(resolve => setTimeout(resolve, 1000));
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
                {video.storageUrl ? (
                  <Cloud className="h-4 w-4 text-green-500" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                )}
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
              ☁️ Processamento na nuvem - vídeos mesclados via Fal.ai
            </p>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <Card className="bg-background/95 border-2 border-accent">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                    <span className="text-sm">Enviando vídeos para a nuvem...</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
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
                  disabled={isGenerating || totalVariations === 0 || isUploading}
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
                    {!isGenerating && failedCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setGeneratedVideos([]);
                          setIsGenerating(false);
                          toast.info("Estado limpo. Clique em 'Gerar Variações' para testar novamente.");
                        }}
                        className="border-destructive text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Limpar e Testar Novamente
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
                        {video.status === 'processing' && 'Processando na nuvem...'}
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
