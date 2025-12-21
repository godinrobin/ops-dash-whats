import { useState, useRef } from 'react';
import { Send, Paperclip, Mic, Smile, Image, FileText, Video, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ChatInputProps {
  onSendMessage: (content: string, messageType?: string, mediaUrl?: string) => Promise<{ error?: string; data?: any }>;
  flows?: { id: string; name: string; is_active: boolean }[];
  onTriggerFlow?: (flowId: string) => void;
}

export const ChatInput = ({ onSendMessage, flows = [], onTriggerFlow }: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFlowsMenu, setShowFlowsMenu] = useState(false);
  const [attachDialog, setAttachDialog] = useState<{ type: 'image' | 'video' | 'document'; open: boolean }>({ type: 'image', open: false });
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSendMedia = async () => {
    if (!mediaUrl.trim()) {
      toast.error('Por favor, insira a URL do arquivo');
      return;
    }

    setSending(true);
    const result = await onSendMessage(mediaCaption || '', attachDialog.type, mediaUrl.trim());
    
    if (result.error) {
      toast.error('Erro ao enviar: ' + result.error);
    } else {
      setMediaUrl('');
      setMediaCaption('');
      setAttachDialog({ ...attachDialog, open: false });
      toast.success('Mídia enviada!');
    }
    
    setSending(false);
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

  const openAttachDialog = (type: 'image' | 'video' | 'document') => {
    setAttachDialog({ type, open: true });
    setShowAttachMenu(false);
    setMediaUrl('');
    setMediaCaption('');
  };

  const getAttachTitle = () => {
    switch (attachDialog.type) {
      case 'image': return 'Enviar Imagem';
      case 'video': return 'Enviar Vídeo';
      case 'document': return 'Enviar Documento';
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
              <Picker 
                data={data} 
                onEmojiSelect={handleEmojiSelect}
                theme="dark"
                locale="pt"
                previewPosition="none"
              />
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
          ) : (
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
              <Mic className="h-5 w-5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Media URL Dialog */}
      <Dialog open={attachDialog.open} onOpenChange={(open) => setAttachDialog({ ...attachDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getAttachTitle()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Arquivo</Label>
              <Input
                placeholder="https://exemplo.com/arquivo.jpg"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
              />
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
              <Button onClick={handleSendMedia} disabled={sending || !mediaUrl.trim()}>
                {sending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
