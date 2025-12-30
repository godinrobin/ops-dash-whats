import { Check, CheckCheck, Clock, XCircle, Play, Pause, Download, Loader2, FileText, ImageOff, AlertCircle, Volume2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxMessage } from '@/types/inbox';
import { format } from 'date-fns';
import { useState, useRef, useEffect, useCallback } from 'react';

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

  const MAX_AUDIO_RETRIES = 3;

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
    const labels = {
      image: 'Imagem indisponível',
      audio: 'Áudio indisponível',
      video: 'Vídeo indisponível',
    };
    const descriptions = {
      image: 'A mídia expirou ou não pôde ser carregada',
      audio: 'Toque para tentar novamente',
      video: 'A mídia expirou ou não pôde ser carregada',
    };

    return (
      <div 
        className={cn(
          "flex items-center gap-3 p-4 bg-muted/30 rounded-lg border border-border/50 min-w-[200px]",
          onRetry && "cursor-pointer hover:bg-muted/50 transition-colors"
        )}
        onClick={onRetry}
      >
        <div className="text-muted-foreground">
          {icons[type]}
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-sm font-medium text-muted-foreground">{labels[type]}</span>
          <span className="text-xs text-muted-foreground/70">{descriptions[type]}</span>
        </div>
        {onRetry && (
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
              src={message.media_url || ''} 
              alt="Image" 
              className={cn("rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity", (!imageLoaded || imageError) && "hidden")}
              onLoad={() => { setImageLoaded(true); setImageError(false); }}
              onError={() => { setImageError(true); setImageLoaded(false); }}
              onClick={() => !imageError && window.open(message.media_url || '', '_blank')}
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
              src={message.media_url || ''} 
              preload="auto"
              onEnded={() => {
                setIsPlaying(false);
                setAudioProgress(0);
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
              src={message.media_url || ''} 
              controls 
              className="rounded-lg max-w-full"
              preload="metadata"
              onError={() => setVideoError(true)}
            />
            {message.content && (
              <p className="mt-2 text-sm">{message.content}</p>
            )}
          </div>
        );

      case 'document':
        // Extrair nome do arquivo da URL se content estiver vazio
        let fileName = message.content;
        if (!fileName && message.media_url) {
          try {
            const urlParts = message.media_url.split('/');
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
            href={message.media_url || ''} 
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
            src={message.media_url || ''} 
            alt="Sticker" 
            className="h-24 w-24"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
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