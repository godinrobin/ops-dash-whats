import { Check, CheckCheck, Clock, XCircle, Play, Pause, Download, Loader2, FileText, ImageOff, AlertCircle, Volume2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxMessage } from '@/types/inbox';
import { format } from 'date-fns';
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ChatMessageProps {
  message: InboxMessage;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isOutbound = message.direction === 'outbound';
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [audioLoading, setAudioLoading] = useState(true);
  const [audioRetryCount, setAudioRetryCount] = useState(0);
  const [videoError, setVideoError] = useState(false);
  
  // Media fallback recovery states
  const [isRecoveringMedia, setIsRecoveringMedia] = useState(false);
  const [recoveredMediaUrl, setRecoveredMediaUrl] = useState<string | null>(null);
  const [recoveryFailed, setRecoveryFailed] = useState(false);

  const MAX_AUDIO_RETRIES = 3;
  
  // Get the effective media URL (recovered or original)
  const effectiveMediaUrl = recoveredMediaUrl || message.media_url;
  
  // Check if URL is temporary (WhatsApp CDN) - these expire quickly
  const isTemporaryMediaUrl = useCallback((url: string | null) => {
    if (!url) return false;
    return url.includes('mmg.whatsapp.net') || url.includes('cdn.whatsapp.net');
  }, []);
  
  // Function to recover media via fallback endpoint
  const recoverMedia = useCallback(async () => {
    // Prevent multiple attempts or if already recovered
    if (isRecoveringMedia || recoveryFailed || recoveredMediaUrl) return;
    
    setIsRecoveringMedia(true);
    
    try {
      // Wrap the entire invoke in try-catch since Supabase can throw on 500 errors
      let response;
      try {
        response = await supabase.functions.invoke('get-media-fallback', {
          body: { messageId: message.id }
        });
      } catch {
        // Supabase throws on network or 500 errors - treat as recovery failed
        setRecoveryFailed(true);
        setIsRecoveringMedia(false);
        return;
      }
      
      // Handle both error object and non-success response
      if (response?.error || !response?.data?.success) {
        // This is expected for old messages - don't log as error
        setRecoveryFailed(true);
        setIsRecoveringMedia(false);
        return;
      }
      
      if (response?.data?.media_url) {
        setRecoveredMediaUrl(response.data.media_url);
        // Reset error states since we have a new URL
        setImageError(false);
        setAudioError(false);
        setVideoError(false);
        setAudioRetryCount(0);
      } else {
        setRecoveryFailed(true);
      }
    } catch {
      // Silently handle any other errors
      setRecoveryFailed(true);
    } finally {
      setIsRecoveringMedia(false);
    }
  }, [message.id, isRecoveringMedia, recoveryFailed, recoveredMediaUrl]);

  const retryAudio = useCallback(() => {
    if (audioRef.current && audioRetryCount < MAX_AUDIO_RETRIES) {
      setAudioError(false);
      setAudioLoading(true);
      setAudioRetryCount(prev => prev + 1);
      
      // Force reload by resetting src
      const currentSrc = audioRef.current.src;
      audioRef.current.src = '';
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = currentSrc;
          audioRef.current.load();
        }
      }, 100);
    }
  }, [audioRetryCount]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
      setAudioError(false);
      setAudioLoading(false);
    };

    const handleCanPlay = () => {
      setAudioLoading(false);
      setAudioError(false);
    };

    const handleError = () => {
      // Only mark as error after loading state completes
      setAudioLoading(false);
      
      // Auto-retry if we haven't exceeded max retries
      if (audioRetryCount < MAX_AUDIO_RETRIES) {
        console.log(`[Audio] Retrying load (attempt ${audioRetryCount + 1}/${MAX_AUDIO_RETRIES})`);
        setTimeout(retryAudio, 1000 * (audioRetryCount + 1)); // Exponential backoff
      } else {
        setAudioError(true);
      }
    };

    const handleWaiting = () => {
      setAudioLoading(true);
    };

    const handlePlaying = () => {
      setAudioLoading(false);
      setIsPlaying(true);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
    };
  }, [audioRetryCount, retryAudio]);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    
    // If there was an error, try to retry
    if (audioError) {
      setAudioRetryCount(0);
      retryAudio();
      return;
    }
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setAudioLoading(true);
      audioRef.current.play()
        .then(() => {
          setAudioLoading(false);
          setIsPlaying(true);
        })
        .catch(() => {
          setAudioLoading(false);
          if (audioRetryCount < MAX_AUDIO_RETRIES) {
            retryAudio();
          } else {
            setAudioError(true);
          }
        });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch (message.status) {
      case 'pending':
        return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />;
      case 'sent':
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  // Check if media URL is from WhatsApp (temporary) vs our storage (permanent)
  const isTemporaryUrl = (url: string | null) => {
    if (!url) return false;
    return url.includes('mmg.whatsapp.net') || url.includes('cdn.whatsapp.net');
  };

  const renderExpiredMedia = (type: 'image' | 'audio' | 'video', onRetry?: () => void) => {
    const icons = {
      image: <ImageOff className="h-6 w-6" />,
      audio: <Volume2 className="h-6 w-6" />,
      video: <AlertCircle className="h-6 w-6" />,
    };
    
    // Show recovering state
    if (isRecoveringMedia) {
      return (
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border border-border/50 min-w-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <div className="flex flex-col flex-1">
            <span className="text-sm font-medium text-muted-foreground">Recuperando mídia...</span>
            <span className="text-xs text-muted-foreground/70">Aguarde um momento</span>
          </div>
        </div>
      );
    }
    
    const labels = {
      image: recoveryFailed ? 'Imagem não recuperável' : 'Imagem indisponível',
      audio: recoveryFailed ? 'Áudio não recuperável' : 'Áudio indisponível',
      video: recoveryFailed ? 'Vídeo não recuperável' : 'Vídeo indisponível',
    };
    const descriptions = {
      image: recoveryFailed ? 'A mídia não pôde ser recuperada' : 'Toque para tentar recuperar',
      audio: recoveryFailed ? 'A mídia não pôde ser recuperada' : 'Toque para tentar recuperar',
      video: recoveryFailed ? 'A mídia não pôde ser recuperada' : 'Toque para tentar recuperar',
    };

    const handleClick = () => {
      if (!recoveryFailed) {
        recoverMedia();
      } else if (onRetry) {
        onRetry();
      }
    };

    return (
      <div 
        className={cn(
          "flex items-center gap-3 p-4 bg-muted/30 rounded-lg border border-border/50 min-w-[200px]",
          !recoveryFailed && "cursor-pointer hover:bg-muted/50 transition-colors"
        )}
        onClick={handleClick}
      >
        <div className="text-muted-foreground">
          {icons[type]}
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-sm font-medium text-muted-foreground">{labels[type]}</span>
          <span className="text-xs text-muted-foreground/70">{descriptions[type]}</span>
        </div>
        {!recoveryFailed && (
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (message.message_type) {
      case 'image':
        if (imageError) {
          return (
            <div className="max-w-xs">
              {renderExpiredMedia('image')}
              {message.content && (
                <p className="mt-2 text-sm">{message.content}</p>
              )}
            </div>
          );
        }
        return (
          <div className="max-w-xs">
            {!imageLoaded && !imageError && (
              <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <img 
              src={effectiveMediaUrl || ''} 
              alt="Image" 
              className={cn("rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity", (!imageLoaded || imageError) && "hidden")}
              onLoad={() => { setImageLoaded(true); setImageError(false); }}
              onError={() => { 
                setImageError(true); 
                setImageLoaded(false);
                // Auto-trigger recovery for temporary URLs
                if (isTemporaryMediaUrl(effectiveMediaUrl) && !recoveredMediaUrl && !recoveryFailed) {
                  recoverMedia();
                }
              }}
              onClick={() => !imageError && window.open(effectiveMediaUrl || '', '_blank')}
            />
            {message.content && (
              <p className="mt-2 text-sm">{message.content}</p>
            )}
          </div>
        );

      case 'audio':
        // Show error state with retry option
        if (audioError) {
          return renderExpiredMedia('audio', () => {
            setAudioRetryCount(0);
            retryAudio();
          });
        }
        
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <button 
              onClick={toggleAudio}
              disabled={audioLoading && !audioError}
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center transition-colors",
                audioLoading && !audioError
                  ? "bg-muted cursor-wait"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {audioLoading && !audioError ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </button>
            <div className="flex-1 flex flex-col gap-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-100"
                  style={{ width: `${audioProgress}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {audioLoading ? 'Carregando...' : formatDuration(audioDuration)}
              </span>
            </div>
            <audio 
              ref={audioRef} 
              src={effectiveMediaUrl || ''} 
              preload="auto"
              onEnded={() => {
                setIsPlaying(false);
                setAudioProgress(0);
              }}
              onError={() => {
                // Auto-trigger recovery for temporary URLs
                if (isTemporaryMediaUrl(effectiveMediaUrl) && !recoveredMediaUrl && !recoveryFailed && audioRetryCount >= MAX_AUDIO_RETRIES) {
                  recoverMedia();
                }
              }}
            />
          </div>
        );

      case 'video':
        if (videoError) {
          return (
            <div className="max-w-xs">
              {renderExpiredMedia('video')}
              {message.content && (
                <p className="mt-2 text-sm">{message.content}</p>
              )}
            </div>
          );
        }
        return (
          <div className="max-w-xs">
            <video 
              src={effectiveMediaUrl || ''} 
              controls 
              className="rounded-lg max-w-full"
              preload="metadata"
              onError={() => {
                setVideoError(true);
                // Auto-trigger recovery for temporary URLs
                if (isTemporaryMediaUrl(effectiveMediaUrl) && !recoveredMediaUrl && !recoveryFailed) {
                  recoverMedia();
                }
              }}
            />
            {message.content && (
              <p className="mt-2 text-sm">{message.content}</p>
            )}
          </div>
        );

      case 'document':
        // Extrair nome do arquivo da URL se content estiver vazio
        let fileName = message.content;
        if (!fileName && effectiveMediaUrl) {
          try {
            const urlParts = effectiveMediaUrl.split('/');
            const lastPart = urlParts[urlParts.length - 1];
            fileName = decodeURIComponent(lastPart.split('?')[0]);
          } catch {
            fileName = 'Documento';
          }
        }
        
        // Determinar ícone e cor baseado na extensão
        const extension = fileName?.split('.').pop()?.toLowerCase() || '';
        const isPdf = extension === 'pdf';
        
        return (
          <a 
            href={effectiveMediaUrl || ''} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors min-w-[200px]"
          >
            <div className={cn(
              "flex-shrink-0 h-10 w-10 rounded flex items-center justify-center",
              isPdf ? "bg-red-500" : "bg-blue-500"
            )}>
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{fileName || 'Documento'}</span>
              <span className="text-xs text-muted-foreground">Clique para baixar</span>
            </div>
            <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </a>
        );

      case 'sticker':
        return (
          <img 
            src={effectiveMediaUrl || ''} 
            alt="Sticker" 
            className="h-24 w-24"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              // Auto-trigger recovery for temporary URLs
              if (isTemporaryMediaUrl(effectiveMediaUrl) && !recoveredMediaUrl && !recoveryFailed) {
                recoverMedia();
              }
            }}
          />
        );

      default:
        // Handle empty content gracefully
        const displayContent = message.content?.trim() || '[Mensagem vazia]';
        return (
          <p className={cn(
            "text-sm whitespace-pre-wrap break-words",
            !message.content?.trim() && "italic text-muted-foreground"
          )}>
            {displayContent}
          </p>
        );
    }
  };
  return (
    <div className={cn(
      "flex animate-in fade-in slide-in-from-bottom-2 duration-200",
      isOutbound ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[70%] rounded-lg px-3 py-2 shadow-sm transition-all",
        isOutbound 
          ? "bg-primary text-primary-foreground rounded-br-none" 
          : "bg-card border border-border rounded-bl-none",
        message.status === 'pending' && "opacity-70",
        message.status === 'failed' && "border-destructive bg-destructive/10"
      )}>
        {renderContent()}
        
        <div className={cn(
          "flex items-center justify-end gap-1 mt-1",
          isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          <span className="text-[10px]">
            {format(new Date(message.created_at), 'HH:mm')}
          </span>
          {isOutbound && (
            <span className="flex items-center">
              {getStatusIcon()}
            </span>
          )}
        </div>
        
        {message.status === 'failed' && (
          <p className={cn(
            "text-[10px] mt-1",
            isOutbound ? "text-primary-foreground/70" : "text-destructive"
          )}>
            Falha no envio
          </p>
        )}
      </div>
    </div>
  );
};