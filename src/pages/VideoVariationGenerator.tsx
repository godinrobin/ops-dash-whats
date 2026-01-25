import { useState, useEffect, useRef, useCallback, DragEvent } from "react";
import { SystemLayout } from "@/components/layout/SystemLayout";
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
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { AudioSection } from "@/components/AudioSection";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { useCredits } from "@/hooks/useCredits";
import { SystemCreditBadge } from "@/components/credits/SystemCreditBadge";
import { InsufficientCreditsModal } from "@/components/credits/InsufficientCreditsModal";
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
  RefreshCw,
  Subtitles,
  Check,
  Square,
  CheckSquare,
  Mic,
  Minus,
  Zap
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  isSubtitled?: boolean;
  subtitleRequestId?: string;
  subtitleStatus?: 'queued' | 'processing' | 'done' | 'failed';
  subtitledUrl?: string; // URL do vídeo legendado
  originalUrl?: string; // URL original (sem legenda)
}

interface SubtitleConfig {
  style: 'tiktok' | 'youtube' | 'classic' | 'karaoke' | 'minimal' | 'neon' | 'custom';
  font: string;
  fontSize: number;
  primaryColor: string;
  highlightColor: string;
  yPosition: number;
  maxWordsPerSegment: number;
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
  useActivityTracker("page_visit", "Gerador de Variações de Vídeo");
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
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false);
  
  // Credits system
  const { isActive: isCreditsActive, isSemiFullMember, loading: creditsLoading } = useCreditsSystem();
  const { deductCredits, canAfford, balance, loading: balanceLoading } = useCredits();
  const CREDIT_COST_PER_VARIATION = 0.10;
  const SYSTEM_ID = 'gerador_variacoes';
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysis | null>(null);
  const [analysisVideoName, setAnalysisVideoName] = useState<string>('');
  
  // Custom variation count
  const [customVariationCount, setCustomVariationCount] = useState<number | null>(null);
  
  // Pause state
  const [isPaused, setIsPaused] = useState(false);
  
  // Subtitle state
  const [selectedForSubtitle, setSelectedForSubtitle] = useState<string[]>([]);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>({
    style: 'tiktok',
    font: 'Montserrat/Montserrat-ExtraBold.ttf',
    fontSize: 80,
    primaryColor: 'white',
    highlightColor: 'yellow',
    yPosition: 70,
    maxWordsPerSegment: 3
  });
  const [isAddingSubtitles, setIsAddingSubtitles] = useState(false);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const subtitlePollingRef = useRef<NodeJS.Timeout | null>(null);
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
      if (subtitlePollingRef.current) {
        clearInterval(subtitlePollingRef.current);
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
          const existingVideos: GeneratedVideo[] = allJobs.map((job: any) => ({
            id: job.id,
            name: job.variation_name,
            status: job.status as 'queued' | 'processing' | 'done' | 'failed',
            requestId: job.render_id,
            responseUrl: `https://queue.fal.run/fal-ai/ffmpeg-api/requests/${job.render_id}`,
            url: job.is_subtitled ? (job.subtitled_video_url || job.video_url) : (job.video_url || undefined),
            isSubtitled: job.is_subtitled || false,
            subtitledUrl: job.subtitled_video_url || undefined,
            originalUrl: job.original_video_url || job.video_url || undefined
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

  // Subtitle functions
  const toggleVideoSelection = (videoId: string) => {
    setSelectedForSubtitle(prev => 
      prev.includes(videoId) 
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
  };

  const selectAllCompleted = () => {
    const completedIds = generatedVideos
      .filter(v => v.status === 'done' && v.url && !v.isSubtitled)
      .map(v => v.id);
    setSelectedForSubtitle(completedIds);
  };

  const deselectAll = () => {
    setSelectedForSubtitle([]);
  };

  const allowedSubtitleColors = new Set([
    'white',
    'black',
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
    'purple',
    'pink',
    'brown',
    'gray',
    'cyan',
    'magenta',
  ]);

  const normalizeSubtitleColor = (value: string | undefined, fallback: string) => {
    const v = (value ?? '').trim().toLowerCase();
    if (!v) return fallback;

    // Backward-compat for old UI that sent hex
    const hexMap: Record<string, string> = {
      '#ff00ff': 'magenta',
      '#00ff00': 'green',
    };
    if (hexMap[v]) return hexMap[v];

    // Unknown hex => fallback
    if (v.startsWith('#')) return fallback;

    return allowedSubtitleColors.has(v) ? v : fallback;
  };

  const applySubtitlePreset = (preset: 'tiktok' | 'youtube' | 'classic' | 'karaoke' | 'minimal' | 'neon') => {
    const presets: Record<string, SubtitleConfig> = {
      tiktok: {
        style: 'tiktok',
        font: 'Montserrat/Montserrat-ExtraBold.ttf',
        fontSize: 100,
        primaryColor: 'white',
        highlightColor: 'yellow',
        yPosition: 70,
        maxWordsPerSegment: 1
      },
      youtube: {
        style: 'youtube',
        font: 'Poppins/Poppins-Bold.ttf',
        fontSize: 70,
        primaryColor: 'white',
        highlightColor: 'green',
        yPosition: 80,
        maxWordsPerSegment: 3
      },
      classic: {
        style: 'classic',
        font: 'Arial',
        fontSize: 50,
        primaryColor: 'white',
        highlightColor: 'yellow',
        yPosition: 90,
        maxWordsPerSegment: 10
      },
      karaoke: {
        style: 'karaoke',
        font: 'Montserrat/Montserrat-ExtraBold.ttf',
        fontSize: 90,
        primaryColor: 'yellow',
        highlightColor: 'green',
        yPosition: 70,
        maxWordsPerSegment: 1
      },
      minimal: {
        style: 'minimal',
        font: 'Arial',
        fontSize: 40,
        primaryColor: 'white',
        highlightColor: 'white',
        yPosition: 85,
        maxWordsPerSegment: 8
      },
      neon: {
        style: 'neon',
        font: 'Montserrat/Montserrat-ExtraBold.ttf',
        fontSize: 80,
        primaryColor: 'cyan',
        highlightColor: 'magenta',
        yPosition: 70,
        maxWordsPerSegment: 2
      }
    };
    setSubtitleConfig(presets[preset]);
  };

  const startSubtitleProcess = async () => {
    if (selectedForSubtitle.length === 0) {
      toast.error('Selecione pelo menos um vídeo para legendar');
      return;
    }

    setShowSubtitleModal(false);
    setIsAddingSubtitles(true);

    const videosToSubtitle = generatedVideos.filter(
      v => selectedForSubtitle.includes(v.id) && v.status === 'done' && v.url
    );

    // Submit subtitle jobs for each selected video
    for (const video of videosToSubtitle) {
      try {
        setGeneratedVideos(prev => prev.map(v => 
          v.id === video.id 
            ? { ...v, subtitleStatus: 'queued' as const }
            : v
        ));

        const { data, error } = await supabase.functions.invoke('add-subtitles-to-video', {
          body: {
            action: 'add-subtitles',
            videoUrl: video.url,
            subtitleConfig: {
              font: subtitleConfig.font,
              fontSize: subtitleConfig.fontSize,
              primaryColor: normalizeSubtitleColor(subtitleConfig.primaryColor, 'white'),
              highlightColor: normalizeSubtitleColor(subtitleConfig.highlightColor, 'yellow'),
              yPosition: subtitleConfig.yPosition,
              maxWordsPerSegment: subtitleConfig.maxWordsPerSegment,
              wordLevel: subtitleConfig.maxWordsPerSegment <= 3,
              language: 'pt'
            }
          }
        });

        if (error || !data?.success) {
          console.error('Error submitting subtitle job:', error || data?.error);
          setGeneratedVideos(prev => prev.map(v => 
            v.id === video.id 
              ? { ...v, subtitleStatus: 'failed' as const }
              : v
          ));
          continue;
        }

        setGeneratedVideos(prev => prev.map(v => 
          v.id === video.id 
            ? { 
                ...v, 
                subtitleStatus: 'processing' as const,
                subtitleRequestId: data.requestId
              }
            : v
        ));
      } catch (err) {
        console.error('Error submitting subtitle job:', err);
        setGeneratedVideos(prev => prev.map(v => 
          v.id === video.id 
            ? { ...v, subtitleStatus: 'failed' as const }
            : v
        ));
      }
    }

    // Start polling for subtitle completion
    startSubtitlePolling();
    setSelectedForSubtitle([]);
    toast.success(`${videosToSubtitle.length} vídeos enviados para legendagem!`);
  };

  const checkSubtitleStatus = async (
    requestId: string
  ): Promise<{ status: string; videoUrl?: string; error?: string }> => {
    const { data, error } = await supabase.functions.invoke('add-subtitles-to-video', {
      body: { action: 'status', requestId }
    });

    if (error) {
      console.error('Subtitle status check error:', error);
      return { status: 'failed', error: error.message };
    }

    return {
      status: data.status,
      videoUrl: data.videoUrl,
      error: data.error
    };
  };

  const startSubtitlePolling = () => {
    if (subtitlePollingRef.current) {
      clearInterval(subtitlePollingRef.current);
    }

    subtitlePollingRef.current = setInterval(async () => {
      const currentVideos = generatedVideosRef.current;
      const pendingSubtitles = currentVideos?.filter(
        v => v.subtitleRequestId && (v.subtitleStatus === 'processing' || v.subtitleStatus === 'queued')
      ) || [];

      if (pendingSubtitles.length === 0) {
        if (subtitlePollingRef.current) {
          clearInterval(subtitlePollingRef.current);
          subtitlePollingRef.current = null;
        }
        setIsAddingSubtitles(false);
        
        const hasSubtitled = currentVideos?.some(v => v.isSubtitled);
        if (hasSubtitled) {
          toast.success('Legendagem concluída!');
        }
        return;
      }

      console.log(`Checking subtitle status for ${pendingSubtitles.length} videos...`);

      for (const video of pendingSubtitles) {
        if (!video.subtitleRequestId) continue;

        try {
          const result = await checkSubtitleStatus(video.subtitleRequestId);
          
          if (result.status === 'done' && result.videoUrl) {
            const originalUrl = video.originalUrl || video.url;
            
            // Update state
            setGeneratedVideos(prev => prev.map(v => 
              v.id === video.id 
                ? { 
                    ...v, 
                    subtitleStatus: 'done' as const,
                    subtitledUrl: result.videoUrl,
                    originalUrl: originalUrl,
                    url: result.videoUrl,
                    isSubtitled: true
                  }
                : v
            ));
            
            // Persist to database
            await supabase
              .from('video_generation_jobs')
              .update({ 
                is_subtitled: true,
                subtitled_video_url: result.videoUrl,
                original_video_url: originalUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', video.id);
          } else if (result.status === 'failed') {
            setGeneratedVideos(prev => prev.map(v => 
              v.id === video.id 
                ? { ...v, subtitleStatus: 'failed' as const }
                : v
            ));

            toast.error(`Legenda falhou (${video.name}): ${result.error || 'erro desconhecido'}`);
          }
        } catch (err) {
          console.error(`Error checking subtitle status for ${video.name}:`, err);
        }
      }
    }, 5000);
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
    // Wait for credits system to load to ensure proper enforcement
    if (creditsLoading || balanceLoading) {
      toast.error('Aguarde, carregando informações de créditos...');
      return;
    }

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

    // Calculate total variations to determine credit cost
    const hasAudioClips = audioClips.length > 0;
    let totalVariations = 0;
    if (hasAudioClips) {
      totalVariations = hookVideos.length * bodyVideos.length * ctaVideos.length * audioClips.length;
    } else {
      totalVariations = hookVideos.length * bodyVideos.length * ctaVideos.length;
    }
    // Apply custom variation limit if set
    if (customVariationCount !== null) {
      totalVariations = Math.min(totalVariations, customVariationCount);
    }
    const totalCreditCost = totalVariations * CREDIT_COST_PER_VARIATION;

    // Credit system check (active for credits system users and semi-full members)
    if (isCreditsActive || isSemiFullMember) {
      if (!canAfford(totalCreditCost)) {
        setShowInsufficientCredits(true);
        return;
      }
      
      const success = await deductCredits(
        totalCreditCost,
        SYSTEM_ID,
        `Geração de ${totalVariations} variações de vídeo`
      );
      
      if (!success) {
        setShowInsufficientCredits(true);
        return;
      }
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
    <SystemLayout>
      <div className="min-h-screen bg-background">
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
                    disabled={isGenerating || videoVariations === 0 || isUploading || creditsLoading || balanceLoading}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processando... {currentProcessing && `(${currentProcessing})`}
                      </>
                    ) : creditsLoading || balanceLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Carregando...
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
                
                {/* Subtitle Selection Bar */}
                {completedCount > 0 && (
                  <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg border border-muted mt-4">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectedForSubtitle.length > 0 ? deselectAll : selectAllCompleted}
                        className="h-8 px-2"
                      >
                        {selectedForSubtitle.length > 0 ? (
                          <CheckSquare className="h-4 w-4 mr-1 text-accent" />
                        ) : (
                          <Square className="h-4 w-4 mr-1" />
                        )}
                        {selectedForSubtitle.length > 0 
                          ? `${selectedForSubtitle.length} selecionado(s)` 
                          : 'Selecionar todos'}
                      </Button>
                    </div>
                    <Button
                      onClick={() => setShowSubtitleModal(true)}
                      disabled={selectedForSubtitle.length === 0 || isAddingSubtitles}
                      size="sm"
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      {isAddingSubtitles ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Legendando...
                        </>
                      ) : (
                        <>
                          <Subtitles className="mr-2 h-4 w-4" />
                          Legendar Selecionados
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
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
                      className={`p-4 bg-muted/50 rounded-lg space-y-3 relative ${
                        selectedForSubtitle.includes(video.id) ? 'ring-2 ring-orange-500' : ''
                      }`}
                    >
                      {/* Selection checkbox for completed videos */}
                      {video.status === 'done' && video.url && !video.isSubtitled && !video.subtitleStatus && (
                        <div className="absolute top-2 left-2">
                          <Checkbox
                            checked={selectedForSubtitle.includes(video.id)}
                            onCheckedChange={() => toggleVideoSelection(video.id)}
                            className="border-orange-500 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                          />
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between pl-6">
                        <span className="text-sm font-medium truncate">{video.name}</span>
                        {video.status === 'done' && !video.subtitleStatus && (
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
                      
                      <div className="flex gap-2 flex-wrap">
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
                        
                        {/* Subtitle status badge */}
                        {video.isSubtitled && (
                          <Badge className="bg-orange-500 hover:bg-orange-600">
                            <Subtitles className="h-3 w-3 mr-1" />
                            Legendado
                          </Badge>
                        )}
                        {video.subtitleStatus === 'processing' && (
                          <Badge variant="secondary" className="bg-orange-500/20 text-orange-500 border-orange-500/50">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Legendando...
                          </Badge>
                        )}
                        {video.subtitleStatus === 'failed' && (
                          <Badge 
                            variant="destructive" 
                            className="cursor-pointer hover:bg-destructive/80"
                            onClick={() => {
                              // Reset subtitle status to allow retry
                              setGeneratedVideos(prev => prev.map(v => 
                                v.id === video.id 
                                  ? { ...v, subtitleStatus: undefined, subtitleRequestId: undefined }
                                  : v
                              ));
                              toast.success('Status resetado! Selecione o vídeo e tente legendar novamente.');
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Tentar novamente
                          </Badge>
                        )}
                      </div>
                      
                      {video.status === 'done' && video.url && (
                        <div className="space-y-2">
                          {/* Preview buttons */}
                          <div className="flex gap-2">
                            {video.isSubtitled ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPreviewVideo(video.subtitledUrl || video.url!)}
                                  className="flex-1 border-orange-500 text-orange-500 hover:bg-orange-500/10"
                                >
                                  <Eye className="mr-1 h-3 w-3" />
                                  Legendado
                                </Button>
                                {video.originalUrl && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPreviewVideo(video.originalUrl!)}
                                    className="flex-1"
                                  >
                                    <Eye className="mr-1 h-3 w-3" />
                                    Original
                                  </Button>
                                )}
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPreviewVideo(video.url!)}
                                className="flex-1"
                              >
                                <Eye className="mr-1 h-3 w-3" />
                                Preview
                              </Button>
                            )}
                          </div>
                          
                          {/* Download buttons */}
                          <div className="flex gap-2">
                            {video.isSubtitled ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadVideo(video.subtitledUrl || video.url!, video.name + '-legendado')}
                                  className="flex-1 border-orange-500 text-orange-500 hover:bg-orange-500/10"
                                >
                                  <Download className="mr-1 h-3 w-3" />
                                  Legendado
                                </Button>
                                {video.originalUrl && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => downloadVideo(video.originalUrl!, video.name)}
                                    className="flex-1"
                                  >
                                    <Download className="mr-1 h-3 w-3" />
                                    Original
                                  </Button>
                                )}
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadVideo(video.url!, video.name)}
                                className="flex-1 border-accent"
                              >
                                <Download className="mr-1 h-3 w-3" />
                                Baixar
                              </Button>
                            )}
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

      {/* Subtitle Configuration Modal */}
      <Dialog open={showSubtitleModal} onOpenChange={setShowSubtitleModal}>
        <DialogContent className="max-w-lg bg-background border-2 border-orange-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Subtitles className="h-5 w-5 text-orange-500" />
              Configurar Legendas
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Preset Selection */}
            <div className="space-y-2">
              <Label>Estilo de Legenda</Label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'tiktok', name: 'TikTok/Reels', icon: Play, desc: 'Destaque palavra a palavra' },
                  { id: 'youtube', name: 'YouTube', icon: FileVideo, desc: 'Estilo clássico de vídeos' },
                  { id: 'classic', name: 'Clássico', icon: Subtitles, desc: 'Legenda simples tradicional' },
                  { id: 'karaoke', name: 'Karaokê', icon: Mic, desc: 'Amarelo com destaque verde' },
                  { id: 'minimal', name: 'Minimalista', icon: Minus, desc: 'Discreto e elegante' },
                  { id: 'neon', name: 'Neon', icon: Zap, desc: 'Ciano com destaque magenta' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applySubtitlePreset(preset.id as any)}
                    className={`relative p-3 rounded-lg border-2 transition-all text-left ${
                      subtitleConfig.style === preset.id 
                        ? 'border-orange-500 ring-2 ring-orange-500/30 bg-orange-500/10' 
                        : 'border-border hover:border-orange-500/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <preset.icon className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium">{preset.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{preset.desc}</p>
                    {subtitleConfig.style === preset.id && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Options */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cor do Texto</Label>
                <Select
                  value={subtitleConfig.primaryColor}
                  onValueChange={(value) => setSubtitleConfig(prev => ({ ...prev, primaryColor: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="white">Branco</SelectItem>
                    <SelectItem value="yellow">Amarelo</SelectItem>
                    <SelectItem value="green">Verde</SelectItem>
                    <SelectItem value="cyan">Ciano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cor do Destaque</Label>
                <Select
                  value={subtitleConfig.highlightColor}
                  onValueChange={(value) => setSubtitleConfig(prev => ({ ...prev, highlightColor: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yellow">Amarelo</SelectItem>
                    <SelectItem value="green">Verde</SelectItem>
                    <SelectItem value="orange">Laranja</SelectItem>
                    <SelectItem value="magenta">Magenta</SelectItem>
                    <SelectItem value="cyan">Ciano</SelectItem>
                    <SelectItem value="red">Vermelho</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Position */}
            <div className="space-y-2">
              <Label>Posição da Legenda</Label>
              <Select
                value={subtitleConfig.yPosition.toString()}
                onValueChange={(value) => setSubtitleConfig(prev => ({ ...prev, yPosition: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">Centro</SelectItem>
                  <SelectItem value="70">Abaixo do Centro</SelectItem>
                  <SelectItem value="85">Inferior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Info */}
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-sm text-muted-foreground">
              <strong className="text-orange-500">{selectedForSubtitle.length}</strong> vídeo(s) selecionado(s) para legendar.
              O processo pode levar alguns minutos por vídeo.
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowSubtitleModal(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={startSubtitleProcess}
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                <Subtitles className="mr-2 h-4 w-4" />
                Iniciar Legendagem
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </SystemLayout>
  );
}