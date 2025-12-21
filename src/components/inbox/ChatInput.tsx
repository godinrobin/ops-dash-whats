import { useState, useRef } from 'react';
import { Send, Paperclip, Mic, Smile, X, Image, FileText, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';

interface ChatInputProps {
  onSendMessage: (content: string, messageType?: string, mediaUrl?: string) => Promise<{ error?: string; data?: any }>;
}

export const ChatInput = ({ onSendMessage }: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
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

  return (
    <div className="border-t border-border p-4 bg-card">
      <div className="flex items-end gap-2">
        {/* Emoji Picker */}
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
          <Smile className="h-5 w-5 text-muted-foreground" />
        </Button>

        {/* Attachment Menu */}
        <Popover open={showAttachMenu} onOpenChange={setShowAttachMenu}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" side="top">
            <div className="space-y-1">
              <Button variant="ghost" className="w-full justify-start gap-2" size="sm">
                <Image className="h-4 w-4" />
                Imagem
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-2" size="sm">
                <Video className="h-4 w-4" />
                Vídeo
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-2" size="sm">
                <FileText className="h-4 w-4" />
                Documento
              </Button>
            </div>
          </PopoverContent>
        </Popover>

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
  );
};
