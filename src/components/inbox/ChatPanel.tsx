import { useRef, useEffect } from 'react';
import { Phone, Video, MoreVertical, User, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { InboxContact, InboxMessage } from '@/types/inbox';

interface ChatPanelProps {
  contact: InboxContact | null;
  messages: InboxMessage[];
  loading: boolean;
  onSendMessage: (content: string, messageType?: string, mediaUrl?: string) => Promise<{ error?: string; data?: any }>;
  onToggleDetails: () => void;
}

export const ChatPanel = ({
  contact,
  messages,
  loading,
  onSendMessage,
  onToggleDetails,
}: ChatPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!contact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/30">
        <div className="text-center">
          <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">Selecione uma conversa</h3>
          <p className="text-muted-foreground mt-2">
            Escolha uma conversa na lista para começar
          </p>
        </div>
      </div>
    );
  }

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return phone.slice(-2);
  };

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={contact.profile_pic_url || undefined} />
            <AvatarFallback>
              {getInitials(contact.name, contact.phone)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">{contact.name || contact.phone}</h3>
            <p className="text-sm text-muted-foreground">{contact.phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onToggleDetails}>
            <User className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className="h-12 w-48 rounded-lg" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4" />
            <p>Nenhuma mensagem ainda</p>
            <p className="text-sm mt-1">Envie uma mensagem para iniciar a conversa</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <ChatInput onSendMessage={onSendMessage} />
    </div>
  );
};
