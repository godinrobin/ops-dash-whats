import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Paperclip, Mic, Smile, Image, FileText, Video, Zap, Square, X, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { cn } from '@/lib/utils';
import { InboxMessage } from '@/types/inbox';

interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  file_url?: string | null;
  assigned_instances: string[];
}

interface ChatInputProps {
  onSendMessage: (content: string, messageType?: string, mediaUrl?: string, replyToMessageId?: string) => Promise<{ error?: string; data?: any }>;
  flows?: { id: string; name: string; is_active: boolean }[];
  onTriggerFlow?: (flowId: string) => Promise<void>;
  contactInstanceId?: string | null;
  replyToMessage?: InboxMessage | null;
  onCancelReply?: () => void;
}

export const ChatInput = ({ onSendMessage, flows = [], onTriggerFlow, contactInstanceId, replyToMessage, onCancelReply }: ChatInputProps) => {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFlowsMenu, setShowFlowsMenu] = useState(false);
  const [attachDialog, setAttachDialog] = useState<{ type: 'image' | 'video' | 'document' | 'audio'; open: boolean }>({ type: 'image', open: false });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [triggeringFlowId, setTriggeringFlowId] = useState<string | null>(null);

  // Quick replies
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplyFilter, setQuickReplyFilter] = useState('');

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Lazy-load emoji-mart to avoid crashing the whole app on initial load.
  const [EmojiPicker, setEmojiPicker] = useState<any>(null);
  const [emojiData, setEmojiData] = useState<any>(null);
  const [emojiLoading, setEmojiLoading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch quick replies
  useEffect(() => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;
    
    const fetchQuickReplies = async () => {
      const { data } = await supabase
        .from('inbox_quick_replies')
        .select('*')
        .eq('user_id', userId);
      
      if (data) {
        setQuickReplies(data.map(r => ({
          id: r.id,
          shortcut: r.shortcut,
          content: r.content,
          type: (r as any).type || 'text',
          file_url: (r as any).file_url || null,
          assigned_instances: (r as any).assigned_instances || [],
        })));
      }
    };
    
    fetchQuickReplies();
  }, [user, effectiveUserId]);

  // Filter quick replies for current instance (text only)
  const filteredQuickReplies = useMemo(() => {
    return quickReplies
      .filter(reply => reply.type === 'text') // Only text replies
      .filter(reply => {
        // If no instances assigned, show for all
        if (reply.assigned_instances.length === 0) return true;
        // If instance matches
        if (contactInstanceId && reply.assigned_instances.includes(contactInstanceId)) return true;
        // If assigned to all (empty means all)
        return false;
      }).filter(reply => {
        if (!quickReplyFilter) return true;
        return reply.shortcut.toLowerCase().includes(quickReplyFilter.toLowerCase());
      });
  }, [quickReplies, contactInstanceId, quickReplyFilter]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    if (EmojiPicker && emojiData) return;
    if (emojiLoading) return;

    setEmojiLoading(true);
    Promise.all([import('@emoji-mart/react'), import('@emoji-mart/data')])
      .then(([pickerMod, dataMod]) => {
        setEmojiData(dataMod.default ?? dataMod);
        setEmojiPicker(() => (pickerMod as any).default ?? pickerMod);
      })
      .catch((err) => {
        console.error('Erro ao carregar emoji picker:', err);
        toast.error('Não foi possível carregar os emojis');
        setShowEmojiPicker(false);
      })
      .finally(() => setEmojiLoading(false));
  }, [showEmojiPicker, EmojiPicker, emojiData, emojiLoading]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;

    const messageToSend = message.trim();
    const replyToId = replyToMessage?.id;
    setSending(true);
    
    // Clear message immediately for better UX
    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    // Clear reply state
    onCancelReply?.();
    
    const result = await onSendMessage(messageToSend, 'text', undefined, replyToId);
    
    if (result.error) {
      toast.error('Erro ao enviar mensagem: ' + result.error);
      // Restore message if failed
      setMessage(messageToSend);
    }
    
    setSending(false);
  };

  const uploadMedia = async (file: File): Promise<string | null> => {
    if (!user) {
      console.error('User not authenticated');
      return null;
    }
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      // Include user ID in path to comply with RLS policies
      const filePath = `${user.id}/inbox-media/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('video-clips')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('video-clips')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleSendMedia = async () => {
    if (!mediaFile) {
      toast.error('Por favor, selecione um arquivo');
      return;
    }

    setUploading(true);
    try {
      const mediaUrl = await uploadMedia(mediaFile);
      
      if (!mediaUrl) {
        toast.error('Erro ao fazer upload do arquivo');
        return;
      }

      // Para documentos, usar o nome do arquivo como content se não houver legenda
      let contentToSend = mediaCaption;
      if (attachDialog.type === 'document' && !mediaCaption.trim()) {
        contentToSend = mediaFile.name;
      }

      const result = await onSendMessage(contentToSend || '', attachDialog.type, mediaUrl);
      
      if (result.error) {
        toast.error('Erro ao enviar: ' + result.error);
      } else {
        setMediaFile(null);
        setMediaCaption('');
        setAttachDialog({ ...attachDialog, open: false });
        toast.success('Mídia enviada!');
      }
    } catch (error) {
      console.error('Error sending media:', error);
      toast.error('Erro ao enviar mídia');
    } finally {
      setUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle quick reply selection with arrow keys
    if (showQuickReplies && filteredQuickReplies.length > 0) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowQuickReplies(false);
        setQuickReplyFilter('');
        return;
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showQuickReplies) {
        // Don't send, close quick replies
        setShowQuickReplies(false);
        setQuickReplyFilter('');
      } else {
        handleSend();
      }
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    
    // Check for "/" trigger
    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setShowQuickReplies(true);
      setQuickReplyFilter(value.slice(1)); // Remove the "/" prefix
    } else {
      setShowQuickReplies(false);
      setQuickReplyFilter('');
    }
    
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const handleQuickReplySelect = async (reply: QuickReply) => {
    setShowQuickReplies(false);
    setQuickReplyFilter('');
    
    if (reply.type === 'text') {
      setMessage(reply.content);
      textareaRef.current?.focus();
    } else if (reply.file_url) {
      // Send media directly
      setSending(true);
      const result = await onSendMessage(reply.content || '', reply.type, reply.file_url);
      if (result.error) {
        toast.error('Erro ao enviar: ' + result.error);
      } else {
        toast.success('Resposta rápida enviada!');
      }
      setSending(false);
    }
  };

  const handleEmojiSelect = (emoji: any) => {
    setMessage((prev) => prev + emoji.native);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const openAttachDialog = (type: 'image' | 'video' | 'document' | 'audio') => {
    setAttachDialog({ type, open: true });
    setShowAttachMenu(false);
    setMediaFile(null);
    setMediaCaption('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate video format - UAZAPI only accepts MP4
      if (attachDialog.type === 'video' && !file.type.includes('mp4') && !file.name.toLowerCase().endsWith('.mp4')) {
        toast.error('Formato de vídeo inválido. Apenas arquivos MP4 são aceitos.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      setMediaFile(file);
    }
  };

  const getAttachTitle = () => {
    switch (attachDialog.type) {
      case 'image': return 'Enviar Imagem';
      case 'video': return 'Enviar Vídeo (apenas MP4)';
      case 'document': return 'Enviar Documento';
      case 'audio': return 'Enviar Áudio';
    }
  };

  const getAcceptTypes = () => {
    switch (attachDialog.type) {
      case 'image': return 'image/*';
      case 'video': return 'video/mp4,.mp4';
      case 'document': return '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv';
      case 'audio': return 'audio/*';
    }
  };

  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/ogg' });
        const audioFile = new File([audioBlob], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' });
        
        setSending(true);
        try {
          const mediaUrl = await uploadMedia(audioFile);
          if (mediaUrl) {
            await onSendMessage('', 'audio', mediaUrl);
            toast.success('Áudio enviado!');
          } else {
            toast.error('Erro ao fazer upload do áudio');
          }
        } catch (error) {
          toast.error('Erro ao enviar áudio');
        } finally {
          setSending(false);
        }

        stream.getTracks().forEach(track => track.stop());
      };

      setMediaRecorder(recorder);
      setAudioChunks([]);
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Erro ao iniciar gravação. Verifique as permissões do microfone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const activeFlows = flows.filter(f => f.is_active);

  return (
    <>
      <div className="border-t border-border bg-card">
        {/* Reply Preview */}
        {replyToMessage && (
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2 border-l-4 border-primary">
              <Reply className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-primary font-medium">Respondendo</p>
                <p className="text-sm text-muted-foreground truncate">
                  {replyToMessage.content || 
                   (replyToMessage.message_type === 'audio' ? '🎵 Áudio' : 
                    replyToMessage.message_type === 'image' ? '📷 Imagem' : 
                    replyToMessage.message_type === 'video' ? '🎬 Vídeo' : 
                    replyToMessage.message_type === 'document' ? '📄 Documento' : 'Mídia')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={onCancelReply}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="p-4 pt-2">
        <div className="flex items-end gap-2">
          {/* Emoji Picker */}
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                <Smile className="h-5 w-5 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-0" side="top" align="start">
              {EmojiPicker && emojiData ? (
                <EmojiPicker
                  data={emojiData}
                  onEmojiSelect={handleEmojiSelect}
                  theme="dark"
                  locale="pt"
                  previewPosition="none"
                />
              ) : (
                <div className="p-3 text-xs text-muted-foreground">
                  {emojiLoading ? 'Carregando emojis…' : 'Abrindo emojis…'}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Attachment Menu */}
          <Popover open={showAttachMenu} onOpenChange={setShowAttachMenu}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                <Paperclip className="h-5 w-5 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" side="top">
              <div className="space-y-1">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start gap-2" 
                  size="sm"
                  onClick={() => openAttachDialog('image')}
                >
                  <Image className="h-4 w-4" />
                  Imagem
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start gap-2" 
                  size="sm"
                  onClick={() => openAttachDialog('video')}
                >
                  <Video className="h-4 w-4" />
                  Vídeo
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start gap-2" 
                  size="sm"
                  onClick={() => openAttachDialog('document')}
                >
                  <FileText className="h-4 w-4" />
                  Documento
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Flows Menu */}
          {activeFlows.length > 0 && (
            <Popover open={showFlowsMenu} onOpenChange={setShowFlowsMenu}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" side="top">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground px-2 py-1">Disparar Fluxo</p>
                  {activeFlows.map((flow) => (
                    <Button 
                      key={flow.id}
                      variant="ghost" 
                      className="w-full justify-start gap-2" 
                      size="sm"
                      disabled={triggeringFlowId === flow.id}
                      onClick={async () => {
                        setShowFlowsMenu(false);
                        setTriggeringFlowId(flow.id);
                        toast.loading(`Disparando fluxo "${flow.name}"...`, { id: `flow-trigger-${flow.id}` });
                        try {
                          await onTriggerFlow?.(flow.id);
                          toast.success(`Fluxo "${flow.name}" disparado!`, { id: `flow-trigger-${flow.id}` });
                        } catch (err) {
                          console.error('Erro ao disparar fluxo:', err);
                          toast.error('Erro ao disparar fluxo', { id: `flow-trigger-${flow.id}` });
                        } finally {
                          setTriggeringFlowId(null);
                        }
                      }}
                    >
                      {triggeringFlowId === flow.id ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <Zap className="h-4 w-4 text-primary" />
                      )}
                      {flow.name}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Message Input */}
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Digite sua mensagem... (use / para respostas rápidas)"
              value={message}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              className="min-h-[40px] max-h-[120px] resize-none pr-10"
              rows={1}
            />
            
            {/* Quick Replies Dropdown */}
            {showQuickReplies && filteredQuickReplies.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="p-2 border-b border-border">
                  <p className="text-xs text-orange-500 font-medium">Respostas Rápidas</p>
                </div>
                <ScrollArea className="max-h-48">
                  {filteredQuickReplies.map((reply) => (
                    <button
                      key={reply.id}
                      onClick={() => handleQuickReplySelect(reply)}
                      className="w-full px-3 py-2 text-left hover:bg-orange-500/10 transition-colors border-b border-border/50 last:border-0"
                    >
                      <span className="text-orange-500 text-sm font-medium">/{reply.shortcut}</span>
                    </button>
                  ))}
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Send / Record Button */}
          {message.trim() ? (
            <Button 
              onClick={handleSend} 
              disabled={sending}
              size="icon" 
              className="h-10 w-10 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          ) : isRecording ? (
            <Button 
              variant="destructive"
              size="icon" 
              className="h-10 w-10 shrink-0 animate-pulse"
              onClick={stopRecording}
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 shrink-0"
              onClick={startRecording}
              disabled={sending}
            >
              <Mic className="h-5 w-5 text-muted-foreground" />
            </Button>
          )}
        </div>
        </div>
      </div>

      {/* Media Upload Dialog */}
      <Dialog open={attachDialog.open} onOpenChange={(open) => setAttachDialog({ ...attachDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getAttachTitle()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selecionar Arquivo</Label>
              <Input
                type="file"
                accept={getAcceptTypes()}
                onChange={handleFileSelect}
                ref={fileInputRef}
              />
              {mediaFile && (
                <p className="text-sm text-muted-foreground">
                  Selecionado: {mediaFile.name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Legenda (opcional)</Label>
              <Input
                placeholder="Descrição do arquivo..."
                value={mediaCaption}
                onChange={(e) => setMediaCaption(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAttachDialog({ ...attachDialog, open: false })}>
                Cancelar
              </Button>
              <Button onClick={handleSendMedia} disabled={uploading || !mediaFile}>
                {uploading ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
