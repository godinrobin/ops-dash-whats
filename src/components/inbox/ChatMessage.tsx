import { Check, CheckCheck, Clock, XCircle, Play, Pause, Download, Loader2, FileText, ImageOff, AlertCircle, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxMessage } from '@/types/inbox';
import { format } from 'date-fns';
import { useState, useRef, useEffect } from 'react';

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
  const [videoError, setVideoError] = useState(false);

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
    };

    const handleError = () => {
      setAudioError(true);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const toggleAudio = () => {
    if (!audioRef.current || audioError) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => setAudioError(true));
    }
    setIsPlaying(!isPlaying);
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

  const renderExpiredMedia = (type: 'image' | 'audio' | 'video') => {
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
      audio: 'A mídia expirou ou não pôde ser carregada',
      video: 'A mídia expirou ou não pôde ser carregada',
    };

    const isTemporary = isTemporaryUrl(message.media_url);

    return (
      <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border border-border/50 min-w-[200px]">
        <div className="text-muted-foreground">
          {icons[type]}
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-sm font-medium text-muted-foreground">{labels[type]}</span>
          <span className="text-xs text-muted-foreground/70">{descriptions[type]}</span>
          {isTemporary && (
            <span className="text-[10px] text-amber-500 mt-1">URL temporária do WhatsApp</span>
          )}
        </div>
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
        if (audioError) {
          return renderExpiredMedia('audio');
        }
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <button 
              onClick={toggleAudio}
              className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <div className="flex-1 flex flex-col gap-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-100"
                  style={{ width: `${audioProgress}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {formatDuration(audioDuration)}
              </span>
            </div>
            <audio 
              ref={audioRef} 
              src={message.media_url || ''} 
              onEnded={() => {
                setIsPlaying(false);
                setAudioProgress(0);
              }}
              onError={() => setAudioError(true)}
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
