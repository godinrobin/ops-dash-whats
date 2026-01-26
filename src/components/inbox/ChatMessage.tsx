import { Check, CheckCheck, Clock, XCircle, Play, Pause, Download, Loader2, FileText, ImageOff, AlertCircle, Volume2, RefreshCw, Reply, Trash2, ChevronDown, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxMessage, InboxMessageWithReply, InboxContact } from '@/types/inbox';
import { format } from 'date-fns';
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/useSplashedToast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ChatMessageProps {
  message: InboxMessageWithReply;
  allMessages?: InboxMessage[];
  contact?: InboxContact | null;
  onReply?: (message: InboxMessageWithReply) => void;
  onMessageDeleted?: (messageId: string) => void;
}

export const ChatMessage = ({ message, allMessages = [], contact, onReply, onMessageDeleted }: ChatMessageProps) => {
  const { toast } = useToast();
  const isOutbound = message.direction === 'outbound';
  const isInbound = message.direction === 'inbound';
  const [showActions, setShowActions] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(message.status === 'deleted' as any);
  
  // Check if message can be deleted (outbound and less than 1 hour old)
  const canDelete = useCallback(() => {
    if (!isOutbound || isDeleted) return false;
    const messageDate = new Date(message.created_at);
    const now = new Date();
    const hoursDiff = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);
    return hoursDiff <= 1;
  }, [isOutbound, message.created_at, isDeleted]);

  const handleDeleteMessage = async () => {
    if (!canDelete()) {
      toast({
        variant: "destructive",
        title: "Não é possível apagar",
        description: "O WhatsApp permite apagar mensagens para todos apenas dentro de 1 hora após o envio.",
      });
      return;
    }

    setIsDeleting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('delete-inbox-message', {
        body: { messageId: message.id }
      });
      
      if (error) throw error;
      
      if (data.success) {
        setIsDeleted(true);
        toast({ title: "Mensagem apagada para todos" });
        onMessageDeleted?.(message.id);
      } else {
        toast({
          variant: "destructive",
          title: "Erro ao apagar",
          description: data.error || data.details || "Não foi possível apagar a mensagem",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Não foi possível apagar a mensagem",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };
  
  // Get contact display info
  const getContactInitials = () => {
    if (contact?.name && contact.name.trim()) {
      return contact.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (contact?.phone) {
      // For LID-only contacts (long phone), show "?"
      if (contact.phone.length > 15) return '?';
      return contact.phone.slice(-2);
    }
    return '?';
  };
  
  const getContactName = () => {
    if (contact?.name && contact.name.trim()) {
      return contact.name;
    }
    return null;
  };
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
      case 'delivered':
      case 'read':
        // Show single check with strong orange for sent statuses
        return <Check className="h-3 w-3 text-accent-strong" />;
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
              <span className="text-[10px] text-accent-strong font-medium">
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
  // Find the replied message if exists
  const repliedMessage = message.reply_to_message_id 
    ? allMessages.find(m => m.id === message.reply_to_message_id) 
    : null;

  const renderRepliedMessage = () => {
    if (!repliedMessage) return null;
    
    const isRepliedInbound = repliedMessage.direction === 'inbound';
    const previewContent = repliedMessage.content 
      ? repliedMessage.content.length > 60 
        ? repliedMessage.content.substring(0, 60) + '...' 
        : repliedMessage.content
      : repliedMessage.message_type === 'image' ? '📷 Imagem'
      : repliedMessage.message_type === 'audio' ? '🎵 Áudio'
      : repliedMessage.message_type === 'video' ? '🎬 Vídeo'
      : repliedMessage.message_type === 'document' ? '📄 Documento'
      : '[Mensagem]';

    return (
      <div className={cn(
        "flex items-start gap-1.5 mb-2 pb-2 border-l-2 pl-2 rounded-sm",
        isOutbound 
          ? "border-primary-foreground/40 bg-primary-foreground/5" 
          : "border-primary/40 bg-primary/5"
      )}>
        <Reply className={cn(
          "h-3 w-3 mt-0.5 flex-shrink-0",
          isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"
        )} />
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "text-[10px] font-medium",
            isOutbound ? "text-primary-foreground/70" : "text-primary"
          )}>
            {isRepliedInbound ? 'Cliente' : 'Você'}
          </span>
          <span className={cn(
            "text-xs truncate",
            isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            {previewContent}
          </span>
        </div>
      </div>
    );
  };

  // If message was deleted, show deleted indicator
  if (isDeleted) {
    return (
      <div 
        className={cn(
          "flex animate-in fade-in slide-in-from-bottom-2 duration-200 gap-2 group relative px-4",
          isOutbound ? "justify-end" : "justify-start"
        )}
      >
        <div className="flex flex-col max-w-[70%]">
          <div className={cn(
            "rounded-lg px-3 py-2 shadow-sm transition-all italic",
            isOutbound 
              ? "bg-muted text-muted-foreground rounded-br-none" 
              : "bg-card border border-border rounded-bl-none text-muted-foreground"
          )}>
            <p className="text-sm">🚫 Mensagem apagada</p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[10px]">
                {format(new Date(message.created_at), 'HH:mm')}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div 
        className={cn(
          "flex animate-in fade-in slide-in-from-bottom-2 duration-200 gap-2 group relative pl-10 pr-10 py-1 rounded-lg transition-colors",
          isOutbound ? "justify-end" : "justify-start",
          "hover:bg-muted/30",
          isDeleting && "opacity-60 pointer-events-none"
        )}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Actions dropdown for outbound messages */}
        {isOutbound && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 transition-all z-10",
                  "p-1.5 rounded-full bg-card border border-border shadow-sm hover:bg-accent",
                  "opacity-0 group-hover:opacity-100",
                  "left-2"
                )}
              >
                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              {onReply && (
                <DropdownMenuItem onClick={() => onReply(message)}>
                  <Reply className="h-4 w-4 mr-2" />
                  Responder
                </DropdownMenuItem>
              )}
              {canDelete() ? (
                <DropdownMenuItem 
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Apagar para todos
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem 
                  disabled
                  className="text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Apagar (expirado)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        
        {/* Reply action button for inbound messages */}
        {onReply && isInbound && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReply(message);
            }}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 transition-all z-10",
              "p-1.5 rounded-full bg-card border border-border shadow-sm hover:bg-accent",
              "opacity-0 group-hover:opacity-100",
              "right-2"
            )}
            title="Responder"
          >
            <Reply className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        
        {/* Avatar for inbound messages */}
        {isInbound && (
          <Avatar className="h-8 w-8 flex-shrink-0 mt-auto">
            {contact?.profile_pic_url && (
              <AvatarImage 
                src={contact.profile_pic_url} 
                alt={contact?.name || 'Contato'}
                onError={(e) => {
                  // Hide the image on error so fallback shows
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <AvatarFallback className="text-xs bg-muted">
              {getContactInitials()}
            </AvatarFallback>
          </Avatar>
        )}
        
        <div className="flex flex-col max-w-[70%]">
          {/* Contact name for inbound messages */}
          {isInbound && getContactName() && (
            <span className="text-xs font-medium text-muted-foreground mb-1 ml-1">
              {getContactName()}
            </span>
          )}
          
          <div className={cn(
            "rounded-lg px-3 py-2 shadow-sm transition-all relative",
            isOutbound 
              ? "bg-primary text-primary-foreground rounded-br-none" 
              : "bg-card border border-border rounded-bl-none",
            message.status === 'pending' && "opacity-70",
            message.status === 'failed' && "border-destructive bg-destructive/10"
          )}>
            {/* Deleting overlay */}
            {isDeleting && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg z-10">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-muted-foreground">Apagando...</span>
                </div>
              </div>
            )}
            
            {renderRepliedMessage()}
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
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem para todos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá apagar a mensagem para você e para o destinatário. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteMessage}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Apagando...
                </>
              ) : (
                "Apagar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};