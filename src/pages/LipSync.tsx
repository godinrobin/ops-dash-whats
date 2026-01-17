import { useState, useRef, useCallback, DragEvent } from "react";
import { SystemLayout } from "@/components/layout/SystemLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Upload,
  Video,
  Music,
  Loader2,
  Play,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Sparkles,
  Mic
} from "lucide-react";

interface MediaFile {
  id: string;
  file: File;
  url: string;
  name: string;
  storageUrl?: string;
  duration?: number;
}

interface LipSyncJob {
  id: string;
  name: string;
  status: 'uploading' | 'queued' | 'processing' | 'done' | 'failed';
  url?: string;
  requestId?: string;
  responseUrl?: string;
  error?: string;
}

type Emotion = 'neutral' | 'happy' | 'angry' | 'sad' | 'disgusted' | 'surprised';
type ModelMode = 'lips' | 'face' | 'head';
type LipsyncMode = 'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap';

export default function LipSync() {
  useActivityTracker("page_visit", "Lip Sync");
  const { user } = useAuth();
  
  const [videoFile, setVideoFile] = useState<MediaFile | null>(null);
  const [audioFile, setAudioFile] = useState<MediaFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [job, setJob] = useState<LipSyncJob | null>(null);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  
  // Settings
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [modelMode, setModelMode] = useState<ModelMode>('face');
  const [lipsyncMode, setLipsyncMode] = useState<LipsyncMode>('bounce');
  
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        resolve(audio.duration);
      };
      audio.onerror = () => {
        resolve(0);
      };
      audio.src = URL.createObjectURL(file);
    });
  };

  const uploadToStorage = async (file: File, type: 'video' | 'audio'): Promise<string | null> => {
    if (!user) return null;
    
    const fileName = `${user.id}/lipsync/${type}/${Date.now()}-${file.name}`;
    
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

  const handleVideoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    
    const file = files[0];
    
    // Accept MP4, MOV, WebM
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato inválido. Use MP4, MOV ou WebM.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      setUploadProgress(30);
      const storageUrl = await uploadToStorage(file, 'video');
      
      if (!storageUrl) {
        toast.error('Erro ao fazer upload do vídeo');
        return;
      }

      setUploadProgress(100);
      
      const localUrl = URL.createObjectURL(file);
      setVideoFile({
        id: Date.now().toString(),
        file,
        url: localUrl,
        name: file.name,
        storageUrl
      });
      
      toast.success('Vídeo enviado com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload do vídeo');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAudioUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    
    const file = files[0];
    
    // Accept MP3, WAV, M4A, OGG
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/x-m4a'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg)$/i)) {
      toast.error('Formato inválido. Use MP3, WAV, M4A ou OGG.');
      return;
    }

    // Check duration
    const duration = await getAudioDuration(file);
    if (duration > 60) {
      toast.error('O áudio deve ter no máximo 1 minuto.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      setUploadProgress(30);
      const storageUrl = await uploadToStorage(file, 'audio');
      
      if (!storageUrl) {
        toast.error('Erro ao fazer upload do áudio');
        return;
      }

      setUploadProgress(100);
      
      const localUrl = URL.createObjectURL(file);
      setAudioFile({
        id: Date.now().toString(),
        file,
        url: localUrl,
        name: file.name,
        storageUrl,
        duration
      });
      
      toast.success('Áudio enviado com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload do áudio');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnterVideo = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVideo(true);
  }, []);

  const handleDragLeaveVideo = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVideo(false);
  }, []);

  const handleDropVideo = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVideo(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleVideoUpload(files);
    }
  }, [user]);

  const handleDragEnterAudio = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingAudio(true);
  }, []);

  const handleDragLeaveAudio = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingAudio(false);
  }, []);

  const handleDropAudio = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingAudio(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleAudioUpload(files);
    }
  }, [user]);

  const removeVideo = () => {
    if (videoFile) {
      URL.revokeObjectURL(videoFile.url);
      setVideoFile(null);
    }
  };

  const removeAudio = () => {
    if (audioFile) {
      URL.revokeObjectURL(audioFile.url);
      setAudioFile(null);
    }
  };

  const checkJobStatus = async (requestId: string, responseUrl: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-fal-status', {
        body: { 
          requestId,
          responseUrl  // Usar a URL correta retornada pela fal.ai
        }
      });

      if (error) {
        console.error('Status check error:', error);
        return { status: 'processing' };
      }

      return {
        status: data.status,
        videoUrl: data.videoUrl
      };
    } catch (err) {
      console.error('Status check error:', err);
      return { status: 'processing' };
    }
  };

  const startPolling = (requestId: string, responseUrl: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    console.log('[LipSync] Starting polling with:', { requestId, responseUrl });

    pollingRef.current = setInterval(async () => {
      const result = await checkJobStatus(requestId, responseUrl);
      
      if (result.status === 'done' || result.status === 'COMPLETED') {
        setJob(prev => prev ? { ...prev, status: 'done', url: result.videoUrl } : null);
        setIsProcessing(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        toast.success('Lip sync concluído!');
      } else if (result.status === 'failed' || result.status === 'FAILED') {
        setJob(prev => prev ? { ...prev, status: 'failed', error: 'Falha no processamento' } : null);
        setIsProcessing(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        toast.error('Falha no processamento do lip sync');
      }
    }, 5000);
  };

  const startLipSync = async () => {
    if (!videoFile?.storageUrl || !audioFile?.storageUrl || !user) {
      toast.error('Selecione um vídeo e um áudio');
      return;
    }

    setIsProcessing(true);
    setJob({
      id: Date.now().toString(),
      name: `${videoFile.name} + ${audioFile.name}`,
      status: 'queued'
    });

    try {
      const { data, error } = await supabase.functions.invoke('lipsync-generate', {
        body: {
          videoUrl: videoFile.storageUrl,
          audioUrl: audioFile.storageUrl,
          emotion,
          modelMode,
          lipsyncMode
        }
      });

      if (error) {
        console.error('Lip sync error:', error);
        setJob(prev => prev ? { ...prev, status: 'failed', error: error.message } : null);
        setIsProcessing(false);
        toast.error('Erro ao iniciar o lip sync');
        return;
      }

      if (!data.success) {
        setJob(prev => prev ? { ...prev, status: 'failed', error: data.error } : null);
        setIsProcessing(false);
        toast.error(data.error || 'Erro ao iniciar o lip sync');
        return;
      }

      setJob(prev => prev ? { 
        ...prev, 
        status: 'processing', 
        requestId: data.requestId,
        responseUrl: data.responseUrl
      } : null);

      toast.success('Lip sync iniciado! Aguarde o processamento...');
      startPolling(data.requestId, data.responseUrl);

    } catch (error) {
      console.error('Lip sync error:', error);
      setJob(prev => prev ? { ...prev, status: 'failed', error: String(error) } : null);
      setIsProcessing(false);
      toast.error('Erro ao iniciar o lip sync');
    }
  };

  const downloadVideo = async () => {
    if (!job?.url) return;
    
    try {
      const response = await fetch(job.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lipsync-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Erro ao baixar o vídeo');
    }
  };

  const resetAll = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    
    if (videoFile) URL.revokeObjectURL(videoFile.url);
    if (audioFile) URL.revokeObjectURL(audioFile.url);
    
    setVideoFile(null);
    setAudioFile(null);
    setJob(null);
    setIsProcessing(false);
    setEmotion('neutral');
    setModelMode('face');
    setLipsyncMode('bounce');
  };

  const getStatusIcon = (status: LipSyncJob['status']) => {
    switch (status) {
      case 'uploading':
      case 'queued':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'done':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = (status: LipSyncJob['status']) => {
    switch (status) {
      case 'uploading':
        return 'Enviando...';
      case 'queued':
        return 'Na fila...';
      case 'processing':
        return 'Processando...';
      case 'done':
        return 'Concluído';
      case 'failed':
        return 'Falhou';
    }
  };

  const canStart = videoFile?.storageUrl && audioFile?.storageUrl && !isProcessing;

  return (
    <SystemLayout>
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Lip Sync</h1>
          <p className="text-muted-foreground">Sincronize áudio com vídeo usando inteligência artificial</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="space-y-6">
          {/* Video Upload */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="w-5 h-5 text-primary" />
                Vídeo com Avatar
              </CardTitle>
              <CardDescription>
                Envie o vídeo com o avatar que você deseja sincronizar
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!videoFile ? (
                <div
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                    transition-colors duration-200
                    ${isDraggingVideo 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border/50 hover:border-primary/50 hover:bg-muted/50'
                    }
                  `}
                  onClick={() => videoInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnterVideo}
                  onDragLeave={handleDragLeaveVideo}
                  onDrop={handleDropVideo}
                >
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => handleVideoUpload(e.target.files)}
                  />
                  <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Arraste ou clique para enviar
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP4, MOV ou WebM
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                    <video 
                      src={videoFile.url} 
                      controls 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground truncate flex-1">
                      {videoFile.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeVideo}
                      disabled={isProcessing}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audio Upload */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Mic className="w-5 h-5 text-primary" />
                Áudio
              </CardTitle>
              <CardDescription>
                Envie o áudio que será sincronizado (máximo 1 minuto)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!audioFile ? (
                <div
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                    transition-colors duration-200
                    ${isDraggingAudio 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border/50 hover:border-primary/50 hover:bg-muted/50'
                    }
                  `}
                  onClick={() => audioInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnterAudio}
                  onDragLeave={handleDragLeaveAudio}
                  onDrop={handleDropAudio}
                >
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/mp4,audio/m4a,audio/ogg,.mp3,.wav,.m4a,.ogg"
                    className="hidden"
                    onChange={(e) => handleAudioUpload(e.target.files)}
                  />
                  <Music className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Arraste ou clique para enviar
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP3, WAV, M4A ou OGG (máx. 1 min)
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <audio 
                    src={audioFile.url} 
                    controls 
                    className="w-full"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground truncate">
                        {audioFile.name}
                      </span>
                      {audioFile.duration && (
                        <Badge variant="secondary" className="shrink-0">
                          {Math.floor(audioFile.duration)}s
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeAudio}
                      disabled={isProcessing}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Settings & Result Section */}
        <div className="space-y-6">
          {/* Settings */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Configurações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Emoção</Label>
                <Select value={emotion} onValueChange={(v) => setEmotion(v as Emotion)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neutral">Neutro</SelectItem>
                    <SelectItem value="happy">Feliz</SelectItem>
                    <SelectItem value="sad">Triste</SelectItem>
                    <SelectItem value="angry">Bravo</SelectItem>
                    <SelectItem value="surprised">Surpreso</SelectItem>
                    <SelectItem value="disgusted">Enojado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modo de Movimento</Label>
                <Select value={modelMode} onValueChange={(v) => setModelMode(v as ModelMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lips">Apenas Lábios</SelectItem>
                    <SelectItem value="face">Rosto (lábios + expressões)</SelectItem>
                    <SelectItem value="head">Cabeça (lábios + expressões + movimento)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modo de Sincronização</Label>
                <Select value={lipsyncMode} onValueChange={(v) => setLipsyncMode(v as LipsyncMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bounce">Bounce (vai e volta)</SelectItem>
                    <SelectItem value="loop">Loop (repete)</SelectItem>
                    <SelectItem value="cut_off">Cortar (para no fim)</SelectItem>
                    <SelectItem value="silence">Silêncio (preenche com silêncio)</SelectItem>
                    <SelectItem value="remap">Remap (ajusta velocidade)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Enviando...</p>
                  <Progress value={uploadProgress} />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1"
                  onClick={startLipSync}
                  disabled={!canStart}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Gerar Lip Sync
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={resetAll}
                  disabled={isProcessing}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Result */}
          {job && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  Resultado
                  {getStatusIcon(job.status)}
                  <Badge variant={job.status === 'done' ? 'default' : 'secondary'}>
                    {getStatusText(job.status)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {job.status === 'done' && job.url ? (
                  <div className="space-y-4">
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                      <video 
                        src={job.url} 
                        controls 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={downloadVideo}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar Vídeo
                    </Button>
                  </div>
                ) : job.status === 'processing' || job.status === 'queued' ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      O lip sync está sendo processado...
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Isso pode levar alguns minutos
                    </p>
                  </div>
                ) : job.status === 'failed' ? (
                  <div className="text-center py-8">
                    <XCircle className="w-10 h-10 mx-auto mb-4 text-destructive" />
                    <p className="text-sm text-destructive">
                      Falha no processamento
                    </p>
                    {job.error && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {job.error}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={startLipSync}
                    >
                      Tentar Novamente
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </div>
    </SystemLayout>
  );
}
