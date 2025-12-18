import { useState, useEffect, useRef, useCallback, DragEvent } from "react";
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
import { AudioSection } from "@/components/AudioSection";
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
  RotateCcw,
  Sparkles,
  Music,
  Pause,
  RefreshCw
} from "lucide-react";

interface VideoClip {
  id: string;
  file: File;
  url: string;
  name: string;
  storageUrl?: string;
}

interface AudioClip {
  id: string;
  file?: File;
  url: string;
  name: string;
  storageUrl?: string;
  isGenerated?: boolean;
  copy?: string;
}

interface GeneratedVideo {
  id: string;
  name: string;
  status: 'queued' | 'processing' | 'done' | 'failed' | 'paused';
  url?: string;
  requestId?: string;
  responseUrl?: string;
  hasAudio?: boolean;
}

interface VideoAnalysis {
  hookScore: number;
  hookAnalysis: string;
  bodyScore: number;
  bodyAnalysis: string;
  ctaScore: number;
  ctaAnalysis: string;
  coherenceScore: number;
  coherenceAnalysis: string;
  overallScore: number;
  overallAnalysis: string;
  transcription: string;
}

export default function VideoVariationGenerator() {
  const { user } = useAuth();
  const [hookVideos, setHookVideos] = useState<VideoClip[]>([]);
  const [bodyVideos, setBodyVideos] = useState<VideoClip[]>([]);
  const [ctaVideos, setCtaVideos] = useState<VideoClip[]>([]);
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentProcessing, setCurrentProcessing] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysis | null>(null);
  const [analysisVideoName, setAnalysisVideoName] = useState<string>('');
  
  // Custom variation count
  const [customVariationCount, setCustomVariationCount] = useState<number | null>(null);
  
  // Pause state
  const [isPaused, setIsPaused] = useState(false);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const generatedVideosRef = useRef<GeneratedVideo[]>();

  const canShowAudioSection = hookVideos.length > 0 && bodyVideos.length > 0 && ctaVideos.length > 0;
  const videoVariations = hookVideos.length * bodyVideos.length * ctaVideos.length;
  const maxVariations = audioClips.length > 0 ? videoVariations * audioClips.length : videoVariations;
  const totalVariations = customVariationCount !== null ? Math.min(customVariationCount, maxVariations) : maxVariations;
  const estimatedTimeSeconds = totalVariations * 60;
  
  // Reset custom count when max changes
  useEffect(() => {
    if (customVariationCount !== null && customVariationCount > maxVariations) {
      setCustomVariationCount(maxVariations);
    }
  }, [maxVariations, customVariationCount]);

  // Keep ref in sync with state for polling
  useEffect(() => {
    generatedVideosRef.current = generatedVideos;
  }, [generatedVideos]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Restart polling when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentVideos = generatedVideosRef.current;
        const hasPending = currentVideos.some(
          v => v.requestId && (v.status === 'processing' || v.status === 'queued')
        );
        
        if (hasPending && !pollingRef.current) {
          console.log('Tab visible again, restarting polling...');
          startPolling();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Recovery: load all jobs (pending + completed) on page load
  useEffect(() => {
    const loadExistingJobs = async () => {
      if (!user) return;

      try {
        // Fetch all jobs from last 24 hours (completed, pending, and failed)
        const { data: allJobs, error } = await supabase
          .from('video_generation_jobs')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching jobs:', error);
          return;
        }

        if (allJobs && allJobs.length > 0) {
          console.log(`Loading ${allJobs.length} existing jobs`);
          
          // Convert database jobs to GeneratedVideo format
          const existingVideos: GeneratedVideo[] = allJobs.map((job) => ({
            id: job.id,
            name: job.variation_name,
            status: job.status as 'queued' | 'processing' | 'done' | 'failed',
            requestId: job.render_id,
            responseUrl: `https://queue.fal.run/fal-ai/ffmpeg-api/requests/${job.render_id}`,
            url: job.video_url || undefined
          }));

          setGeneratedVideos(existingVideos);
          
          // Check if there are pending jobs to poll
          const hasPending = allJobs.some(job => job.status === 'queued' || job.status === 'processing');
          if (hasPending) {
            setIsGenerating(true);
            setTimeout(() => startPolling(), 1000);
            toast.info(`Verificando ${allJobs.filter(j => j.status === 'queued' || j.status === 'processing').length} vídeos em processamento...`);
          }
        }
      } catch (err) {
        console.error('Error loading existing jobs:', err);
      }
    };

    loadExistingJobs();
  }, [user]);

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
        // Only accept MP4 files
        if (file.type !== 'video/mp4') {
          toast.error(`${file.name} não é um arquivo MP4 válido`);
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
      
      if (uploaded > 0) {
        toast.success('Vídeos enviados com sucesso!');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao adicionar vídeos');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, section: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(section);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(null);
  }, []);

  const handleDrop = useCallback((
    e: DragEvent<HTMLDivElement>,
    section: 'hook' | 'body' | 'cta',
    setVideos: React.Dispatch<React.SetStateAction<VideoClip[]>>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(null);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files, section, setVideos);
    }
  }, [user]);

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

  const analyzeVideo = async (videoUrl: string, videoName: string) => {
    setIsAnalyzing(videoName);
    setAnalysisVideoName(videoName);
    
    try {
      // First check for existing analysis
      const { data, error } = await supabase.functions.invoke('analyze-creative-video', {
        body: { videoUrl, videoName, checkExisting: true }
      });

      if (error) {
        console.error('Analysis error:', error);
        toast.error('Erro ao analisar o criativo');
        return;
      }

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.cached) {
        toast.info('Exibindo análise salva anteriormente');
      }

      setAnalysisResult(data.analysis);
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Erro ao analisar o criativo');
    } finally {
      setIsAnalyzing(null);
    }
  };

  // Pause generation
  const pauseGeneration = () => {
    setIsPaused(true);
    setIsGenerating(false);
    
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    
    // Mark queued/processing videos as paused
    setGeneratedVideos(prev => prev.map(v => 
      (v.status === 'queued' || v.status === 'processing') 
        ? { ...v, status: 'paused' as const }
        : v
    ));
    
    toast.info('Geração pausada');
  };

  // Retry failed videos
  const retryFailedVideos = async () => {
    const failedVideos = generatedVideos.filter(v => v.status === 'failed');
    if (failedVideos.length === 0) return;

    setIsGenerating(true);
    setIsPaused(false);

    // Mark failed videos as processing
    setGeneratedVideos(prev => prev.map(v => 
      v.status === 'failed' ? { ...v, status: 'processing' as const } : v
    ));

    // Re-submit failed jobs by fetching their info from the database
    for (const video of failedVideos) {
      try {
        // Get job info from database
        const { data: jobData } = await supabase
          .from('video_generation_jobs')
          .select('*')
          .eq('id', video.id)
          .single();

        if (jobData) {
          // Update status in database
          await supabase
            .from('video_generation_jobs')
            .update({ status: 'queued' })
            .eq('id', video.id);
            
          // Update local state
          setGeneratedVideos(prev => prev.map(v => 
            v.id === video.id 
              ? { ...v, status: 'queued' as const } 
              : v
          ));
        }
      } catch (error) {
        console.error(`Error retrying ${video.name}:`, error);
      }
    }

    // Start polling again
    startPolling();
    toast.success(`Tentando novamente ${failedVideos.length} vídeo(s) com erro`);
  };

  const clearAll = async () => {
    // Clear all uploaded videos and audios
    hookVideos.forEach(v => URL.revokeObjectURL(v.url));
    bodyVideos.forEach(v => URL.revokeObjectURL(v.url));
    ctaVideos.forEach(v => URL.revokeObjectURL(v.url));
    audioClips.forEach(a => { if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url); });
    
    // Delete all jobs from database for this user (last 24 hours)
    if (user) {
      try {
        await supabase
          .from('video_generation_jobs')
          .delete()
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      } catch (err) {
        console.error('Error deleting jobs from database:', err);
      }
    }
    
    setHookVideos([]);
    setBodyVideos([]);
    setCtaVideos([]);
    setAudioClips([]);
    setGeneratedVideos([]);
    setIsGenerating(false);
    setIsPaused(false);
    
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    
    toast.success('Tudo limpo! Pronto para gerar novas variações.');
  };

  const uploadAudioToStorage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    
    const fileName = `${user.id}/audio-${Date.now()}-${file.name}`;
    
    const { data, error } = await supabase.storage
      .from('video-clips')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Audio upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('video-clips')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
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

    // Check if all audios have storage URLs (if any)
    const missingAudioUploads = audioClips.filter(a => !a.storageUrl);
    if (missingAudioUploads.length > 0) {
      toast.error('Alguns áudios ainda estão sendo enviados. Aguarde.');
      return;
    }

    setIsGenerating(true);

    const hasAudio = audioClips.length > 0;

    // Generate all video variation combinations
    interface VideoVariation {
      hook: VideoClip;
      body: VideoClip;
      cta: VideoClip;
      audio?: AudioClip;
      name: string;
    }
    
    const variations: VideoVariation[] = [];
    let count = 1;

    if (hasAudio) {
      // Generate combinations with audio
      for (let h = 0; h < hookVideos.length; h++) {
        for (let b = 0; b < bodyVideos.length; b++) {
          for (let c = 0; c < ctaVideos.length; c++) {
            for (let a = 0; a < audioClips.length; a++) {
              variations.push({
                hook: hookVideos[h],
                body: bodyVideos[b],
                cta: ctaVideos[c],
                audio: audioClips[a],
                name: `Criativo ${count}`
              });
              count++;
            }
          }
        }
      }
    } else {
      // Generate combinations without audio
      for (let h = 0; h < hookVideos.length; h++) {
        for (let b = 0; b < bodyVideos.length; b++) {
          for (let c = 0; c < ctaVideos.length; c++) {
            variations.push({
              hook: hookVideos[h],
              body: bodyVideos[b],
              cta: ctaVideos[c],
              name: `Criativo ${count}`
            });
            count++;
          }
        }
      }
    }

    // Limit variations to the custom count if set
    const limitedVariations = customVariationCount !== null 
      ? variations.slice(0, customVariationCount) 
      : variations;

    // Initialize all videos as queued
    const initialVideos: GeneratedVideo[] = limitedVariations.map((v, i) => ({
      id: `video-${i}-${Date.now()}`,
      name: v.name,
      status: 'queued',
      hasAudio: !!v.audio
    }));
    setGeneratedVideos(initialVideos);

    // Submit jobs in parallel batches for much faster processing
    const BATCH_SIZE = 5; // Process 5 jobs at a time
    const batches: typeof limitedVariations[] = [];
    
    for (let i = 0; i < limitedVariations.length; i += BATCH_SIZE) {
      batches.push(limitedVariations.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      setCurrentProcessing(`Lote ${batchIndex + 1}/${batches.length} (${batch.length} vídeos)`);

      // Process batch in parallel
      const batchPromises = batch.map(async (variation, batchItemIndex) => {
        const globalIndex = batchIndex * BATCH_SIZE + batchItemIndex;
        
        // Update status to processing
        setGeneratedVideos(prev => prev.map((v, idx) => 
          idx === globalIndex ? { ...v, status: 'processing' } : v
        ));

        try {
          if (variation.audio && variation.audio.storageUrl) {
            // With audio: use merge-videos-with-audio endpoint
            const { data, error } = await supabase.functions.invoke('merge-videos', {
              body: {
                videoUrls: [
                  variation.hook.storageUrl,
                  variation.body.storageUrl,
                  variation.cta.storageUrl
                ],
                audioUrl: variation.audio.storageUrl,
                variationName: variation.name
              }
            });

            if (error || !data?.success) {
              console.error('Error submitting job with audio:', error || data?.error);
              return { index: globalIndex, success: false };
            }

            return { 
              index: globalIndex, 
              success: true, 
              requestId: data.requestId, 
              responseUrl: data.responseUrl 
            };
          } else {
            // Without audio: use regular merge-videos endpoint
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
              return { index: globalIndex, success: false };
            }

            return { 
              index: globalIndex, 
              success: true, 
              requestId: data.requestId, 
              responseUrl: data.responseUrl 
            };
          }
        } catch (error) {
          console.error(`Error processing ${variation.name}:`, error);
          return { index: globalIndex, success: false };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Update all results from this batch
      setGeneratedVideos(prev => {
        const updated = [...prev];
        for (const result of batchResults) {
          if (result.success && result.requestId) {
            updated[result.index] = { 
              ...updated[result.index], 
              requestId: result.requestId, 
              responseUrl: result.responseUrl 
            };
          } else {
            updated[result.index] = { ...updated[result.index], status: 'failed' };
          }
        }
        return updated;
      });

      processedCount += batch.length;
      console.log(`Batch ${batchIndex + 1} complete. Total processed: ${processedCount}/${limitedVariations.length}`);
    }

    setCurrentProcessing(null);
    toast.success(`${limitedVariations.length} vídeos enviados para processamento!`);

    // Start polling for results
    startPolling();
  };

  const startPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    let currentBatchStart = 0;
    const POLL_BATCH_SIZE = 10; // Only check 10 videos at a time to avoid overwhelming the API

    // Poll every 5 seconds with batched status checks
    pollingRef.current = setInterval(async () => {
      // Use ref to get current state, avoiding stale closure
      const currentVideos = generatedVideosRef.current;
      const pendingVideos = currentVideos.filter(
        v => v.requestId && (v.status === 'processing' || v.status === 'queued')
      );

      if (pendingVideos.length === 0) {
        // Check if we have any videos at all
        if (currentVideos.length === 0) {
          return;
        }
        
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsGenerating(false);
        toast.success('Todos os vídeos foram processados!');
        return;
      }

      // Get next batch of videos to check (round-robin through all pending)
      const batchToCheck = pendingVideos.slice(currentBatchStart, currentBatchStart + POLL_BATCH_SIZE);
      
      // Update batch start for next iteration
      currentBatchStart = (currentBatchStart + POLL_BATCH_SIZE) % Math.max(pendingVideos.length, 1);

      console.log(`Checking status for ${batchToCheck.length} of ${pendingVideos.length} pending videos...`);

      // Check only this batch of videos
      const statusChecks = batchToCheck.map(async (video) => {
        if (!video.requestId) return null;

        try {
          const result = await checkVideoStatus(video.requestId, video.responseUrl);
          return { video, result };
        } catch (error) {
          console.error(`Error checking status for ${video.name}:`, error);
          return null;
        }
      });

      const results = await Promise.all(statusChecks);

      // Update statuses for checked videos
      setGeneratedVideos(prev => {
        const updated = [...prev];
        for (const item of results) {
          if (!item) continue;
          const { video, result } = item;
          const index = updated.findIndex(v => v.id === video.id);
          if (index === -1) continue;

          if (result.status === 'done' && result.videoUrl) {
            updated[index] = { ...updated[index], status: 'done', url: result.videoUrl };
          } else if (result.status === 'failed') {
            updated[index] = { ...updated[index], status: 'failed' };
          }
        }
        return updated;
      });
    }, 5000); // Poll every 5 seconds with smaller batches
  };

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

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 border-green-500/50';
    if (score >= 60) return 'bg-yellow-500/20 border-yellow-500/50';
    if (score >= 40) return 'bg-orange-500/20 border-orange-500/50';
    return 'bg-red-500/20 border-red-500/50';
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
        <div 
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragging === section 
              ? 'border-accent bg-accent/10' 
              : 'border-muted-foreground/30'
          }`}
          onDragOver={(e) => handleDragOver(e, section)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, section, setVideos)}
        >
          <Input
            type="file"
            accept="video/mp4"
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
              Clique ou arraste vídeos MP4 aqui
            </span>
            <span className="text-xs text-muted-foreground/70">
              Apenas arquivos .mp4 são aceitos
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
                  <CheckCircle className="h-4 w-4 text-green-500" />
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
  const pausedCount = generatedVideos.filter(v => v.status === 'paused').length;
  const allCompleted = generatedVideos.length > 0 && pendingCount === 0 && pausedCount === 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="h-14 md:h-16" />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              🎬 Gerador de Variações de Vídeo
            </h1>
            <p className="text-muted-foreground">
              Crie múltiplas variações de anúncios combinando diferentes hooks, corpos e CTAs
            </p>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <Card className="bg-background/95 border-2 border-accent">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                    <span className="text-sm">Enviando vídeos...</span>
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

          {/* Audio Section - Only shows when all video sections have at least 1 video */}
          {canShowAudioSection && (
            <AudioSection
              audioClips={audioClips}
              setAudioClips={setAudioClips}
              isGenerating={isGenerating}
              onUploadToStorage={uploadAudioToStorage}
            />
          )}

          {/* Stats and Generate Button */}
          <Card className="bg-background/95 border-2 border-accent">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <FileVideo className="h-4 w-4 text-accent" />
                      <span>Vídeos: <strong>{videoVariations}</strong></span>
                    </div>
                    {audioClips.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Music className="h-4 w-4 text-purple-500" />
                        <span>Áudios: <strong>{audioClips.length}</strong></span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <FileVideo className="h-4 w-4 text-green-500" />
                      <span>Máximo de variações: <strong>{maxVariations}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>Tempo estimado: <strong>~{Math.ceil(estimatedTimeSeconds / 60)} min</strong></span>
                    </div>
                  </div>
                </div>
                
                {/* Custom variation count */}
                {maxVariations > 0 && (
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-muted/30 rounded-lg border border-muted">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Quantas variações deseja gerar?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={maxVariations}
                        value={customVariationCount ?? maxVariations}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (isNaN(value) || value < 1) {
                            setCustomVariationCount(1);
                          } else if (value > maxVariations) {
                            setCustomVariationCount(maxVariations);
                          } else {
                            setCustomVariationCount(value);
                          }
                        }}
                        className="w-24 text-center border-accent"
                        disabled={isGenerating}
                      />
                      <span className="text-sm text-muted-foreground">de {maxVariations}</span>
                      {customVariationCount !== null && customVariationCount !== maxVariations && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCustomVariationCount(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Gerar todas
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end gap-2">
                  {isGenerating && (
                    <Button
                      onClick={pauseGeneration}
                      variant="outline"
                      className="border-yellow-500 text-yellow-500 hover:bg-yellow-500/10"
                    >
                      <Pause className="mr-2 h-4 w-4" />
                      Pausar
                    </Button>
                  )}
                  {isPaused && (
                    <>
                      <Button
                        onClick={clearAll}
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive/10"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Limpar
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={generateVariations}
                    disabled={isGenerating || videoVariations === 0 || isUploading}
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
                    {pendingCount > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-accent" />
                        <span>{pendingCount}</span>
                      </div>
                    )}
                    {failedCount > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span>{failedCount}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={retryFailedVideos}
                          disabled={isGenerating}
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          Tentar novamente
                        </Button>
                      </div>
                    )}
                    {allCompleted && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAll}
                        className="border-accent"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Limpar e Recomeçar
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
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto">
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
                        {video.status === 'paused' && (
                          <Pause className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                      <Badge 
                        variant={
                          video.status === 'done' ? 'default' :
                          video.status === 'failed' ? 'destructive' : 
                          video.status === 'paused' ? 'outline' : 'secondary'
                        }
                        className={video.status === 'paused' ? 'border-yellow-500 text-yellow-500' : ''}
                      >
                        {video.status === 'queued' && 'Processando'}
                        {video.status === 'processing' && 'Processando'}
                        {video.status === 'done' && 'Finalizado'}
                        {video.status === 'failed' && 'Falhou'}
                        {video.status === 'paused' && 'Pausado'}
                      </Badge>
                      {video.status === 'done' && video.url && (
                        <div className="space-y-2">
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => analyzeVideo(video.url!, video.name)}
                            disabled={isAnalyzing === video.name}
                            className="w-full bg-purple-500/10 border-purple-500/50 hover:bg-purple-500/20 text-purple-400"
                          >
                            {isAnalyzing === video.name ? (
                              <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Analisando...
                              </>
                            ) : (
                              <>
                                <Sparkles className="mr-1 h-3 w-3" />
                                Análise IA
                              </>
                            )}
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
        <DialogContent className="max-w-md bg-background border-2 border-accent p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">Preview do Vídeo</DialogTitle>
          </DialogHeader>
          {previewVideo && (
            <video 
              src={previewVideo} 
              controls 
              className="w-full rounded-lg max-h-[50vh]"
              autoPlay
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Analysis Result Modal */}
      <Dialog open={!!analysisResult} onOpenChange={() => setAnalysisResult(null)}>
        <DialogContent className="max-w-2xl bg-background border-2 border-accent max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Análise de Criativo - {analysisVideoName}
            </DialogTitle>
          </DialogHeader>
          
          {analysisResult && (
            <div className="space-y-6 py-4">
              {/* Overall Score */}
              <div className={`p-6 rounded-lg border-2 ${getScoreBg(analysisResult.overallScore)} text-center`}>
                <p className="text-sm text-muted-foreground mb-2">Pontuação Geral</p>
                <p className={`text-5xl font-bold ${getScoreColor(analysisResult.overallScore)}`}>
                  {analysisResult.overallScore}
                </p>
                <p className="text-xs text-muted-foreground mt-1">de 100 pontos</p>
              </div>

              {/* Individual Scores */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`p-4 rounded-lg border ${getScoreBg(analysisResult.hookScore)} text-center`}>
                  <div className="w-3 h-3 rounded-full bg-green-500 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Hook</p>
                  <p className={`text-2xl font-bold ${getScoreColor(analysisResult.hookScore)}`}>
                    {analysisResult.hookScore}
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${getScoreBg(analysisResult.bodyScore)} text-center`}>
                  <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Corpo</p>
                  <p className={`text-2xl font-bold ${getScoreColor(analysisResult.bodyScore)}`}>
                    {analysisResult.bodyScore}
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${getScoreBg(analysisResult.ctaScore)} text-center`}>
                  <div className="w-3 h-3 rounded-full bg-purple-500 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">CTA</p>
                  <p className={`text-2xl font-bold ${getScoreColor(analysisResult.ctaScore)}`}>
                    {analysisResult.ctaScore}
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${getScoreBg(analysisResult.coherenceScore || 0)} text-center`}>
                  <div className="w-3 h-3 rounded-full bg-accent mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Coerência</p>
                  <p className={`text-2xl font-bold ${getScoreColor(analysisResult.coherenceScore || 0)}`}>
                    {analysisResult.coherenceScore || 0}
                  </p>
                </div>
              </div>

              {/* Detailed Analysis */}
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <h4 className="font-semibold">Hook (Início)</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{analysisResult.hookAnalysis}</p>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <h4 className="font-semibold">Corpo (Meio)</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{analysisResult.bodyAnalysis}</p>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <h4 className="font-semibold">CTA (Final)</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{analysisResult.ctaAnalysis}</p>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-accent" />
                    <h4 className="font-semibold">🔗 Coerência</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{analysisResult.coherenceAnalysis || 'Análise de coerência não disponível.'}</p>
                </div>

                <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg">
                  <h4 className="font-semibold mb-2">📊 Análise Geral</h4>
                  <p className="text-sm text-muted-foreground">{analysisResult.overallAnalysis}</p>
                </div>

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}