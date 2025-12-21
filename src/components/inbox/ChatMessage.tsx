import { Check, CheckCheck, Clock, XCircle, Play, Pause, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxMessage } from '@/types/inbox';
import { format } from 'date-fns';
import { useState, useRef } from 'react';

interface ChatMessageProps {
  message: InboxMessage;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isOutbound = message.direction === 'outbound';
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const getStatusIcon = () => {
    switch (message.status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-muted-foreground" />;
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
            <img 
              src={message.media_url || ''} 
              alt="Image" 
              className="rounded-lg max-w-full"
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
              className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <div className="flex-1 h-2 bg-muted rounded-full">
              <div className="h-full w-1/3 bg-primary rounded-full"></div>
            </div>
            <audio 
              ref={audioRef} 
              src={message.media_url || ''} 
              onEnded={() => setIsPlaying(false)}
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
      "flex",
      isOutbound ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[70%] rounded-lg px-3 py-2 shadow-sm",
        isOutbound 
          ? "bg-primary text-primary-foreground rounded-br-none" 
          : "bg-card border border-border rounded-bl-none"
      )}>
        {renderContent()}
        
        <div className={cn(
          "flex items-center justify-end gap-1 mt-1",
          isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          <span className="text-[10px]">
            {format(new Date(message.created_at), 'HH:mm')}
          </span>
          {isOutbound && getStatusIcon()}
        </div>
      </div>
    </div>
  );
};
