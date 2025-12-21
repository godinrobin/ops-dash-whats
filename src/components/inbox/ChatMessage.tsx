import { Check, CheckCheck, Clock, XCircle, Play, Pause, Download, Loader2 } from 'lucide-react';
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
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
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

  const renderContent = () => {
    switch (message.message_type) {
      case 'image':
        return (
          <div className="max-w-xs">
            {!imageLoaded && (
              <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <img 
              src={message.media_url || ''} 
              alt="Image" 
              className={cn("rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity", !imageLoaded && "hidden")}
              onLoad={() => setImageLoaded(true)}
              onClick={() => window.open(message.media_url || '', '_blank')}
            />
            {message.content && (
              <p className="mt-2 text-sm">{message.content}</p>
            )}
          </div>
        );

      case 'audio':
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
            />
          </div>
        );

      case 'video':
        return (
          <div className="max-w-xs">
            <video 
              src={message.media_url || ''} 
              controls 
              className="rounded-lg max-w-full"
              preload="metadata"
            />
            {message.content && (
              <p className="mt-2 text-sm">{message.content}</p>
            )}
          </div>
        );

      case 'document':
        return (
          <a 
            href={message.media_url || ''} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <Download className="h-4 w-4" />
            <span>{message.content || 'Documento'}</span>
          </a>
        );

      case 'sticker':
        return (
          <img 
            src={message.media_url || ''} 
            alt="Sticker" 
            className="h-24 w-24"
          />
        );

      default:
        return (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
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
