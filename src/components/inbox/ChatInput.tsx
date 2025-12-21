import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, Smile, Image, FileText, Video, Zap, Square } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ChatInputProps {
  onSendMessage: (content: string, messageType?: string, mediaUrl?: string) => Promise<{ error?: string; data?: any }>;
  flows?: { id: string; name: string; is_active: boolean }[];
  onTriggerFlow?: (flowId: string) => void;
  contactInstanceId?: string | null;
}

export const ChatInput = ({ onSendMessage, flows = [], onTriggerFlow, contactInstanceId }: ChatInputProps) => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFlowsMenu, setShowFlowsMenu] = useState(false);
  const [attachDialog, setAttachDialog] = useState<{ type: 'image' | 'video' | 'document' | 'audio'; open: boolean }>({ type: 'image', open: false });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [uploading, setUploading] = useState(false);

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

    setSending(true);
    const result = await onSendMessage(message.trim());
    
    if (result.error) {
      toast.error('Erro ao enviar mensagem: ' + result.error);
    } else {
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
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

      const result = await onSendMessage(mediaCaption || '', attachDialog.type, mediaUrl);
      
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
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
      setMediaFile(file);
    }
  };

  const getAttachTitle = () => {
    switch (attachDialog.type) {
      case 'image': return 'Enviar Imagem';
      case 'video': return 'Enviar Vídeo';
      case 'document': return 'Enviar Documento';
      case 'audio': return 'Enviar Áudio';
    }
  };

  const getAcceptTypes = () => {
    switch (attachDialog.type) {
      case 'image': return 'image/*';
      case 'video': return 'video/*';
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
      <div className="border-t border-border p-4 bg-card">
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
                      onClick={() => {
                        onTriggerFlow?.(flow.id);
                        setShowFlowsMenu(false);
                        toast.success(`Fluxo "${flow.name}" disparado!`);
                      }}
                    >
                      <Zap className="h-4 w-4 text-primary" />
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
              placeholder="Digite sua mensagem..."
              value={message}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              className="min-h-[40px] max-h-[120px] resize-none pr-10"
              rows={1}
            />
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
