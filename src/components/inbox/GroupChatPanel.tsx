import { useState, useRef, useEffect } from 'react';
import { Users, Send, RefreshCw, Loader2, Settings, Image as ImageIcon, Mic, FileText, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { InboxGroup } from '@/hooks/useInboxGroups';
import { useGroupMessages, GroupMessage } from '@/hooks/useGroupMessages';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface GroupChatPanelProps {
  group: InboxGroup | null;
}

export const GroupChatPanel = ({ group }: GroupChatPanelProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { 
    messages, 
    loading, 
    syncing, 
    syncMessages, 
    sendMessage 
  } = useGroupMessages(
    group?.group_jid || null, 
    group?.instance_id || null
  );

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Sync messages when group changes
  useEffect(() => {
    if (group) {
      syncMessages();
    }
  }, [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/30">
        <div className="text-center">
          <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">Selecione um grupo</h3>
          <p className="text-muted-foreground mt-2">
            Escolha um grupo na lista para ver as mensagens
          </p>
        </div>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getSenderName = (msg: GroupMessage) => {
    if (msg.is_from_me) return 'Você';
    return msg.sender_push_name || msg.sender_name || msg.sender_jid.split('@')[0];
  };

  const formatMessageTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'HH:mm', { locale: ptBR });
    } catch {
      return '';
    }
  };

  const formatMessageDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Hoje';
      if (diffDays === 1) return 'Ontem';
      return format(date, "dd 'de' MMMM", { locale: ptBR });
    } catch {
      return '';
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || sending) return;
    
    const content = messageInput.trim();
    setMessageInput('');
    setSending(true);
    
    try {
      const result = await sendMessage(content);
      if (result.error) {
        toast.error(result.error);
        setMessageInput(content); // Restore on error
      }
    } catch (err) {
      toast.error('Erro ao enviar mensagem');
      setMessageInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: GroupMessage[] }[] = [];
  let currentDate = '';
  
  messages.forEach(msg => {
    const msgDate = formatMessageDate(msg.timestamp);
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <Sheet open={showSettings} onOpenChange={setShowSettings}>
          <SheetTrigger asChild>
            <div className="flex items-center gap-3 cursor-pointer hover:bg-accent/50 p-2 -m-2 rounded-lg transition-colors">
              <Avatar className="h-10 w-10">
                {group.profile_pic_url && (
                  <AvatarImage src={group.profile_pic_url} alt={group.name} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(group.name)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{group.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {group.participant_count} participantes
                </p>
              </div>
            </div>
          </SheetTrigger>
          
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Informações do Grupo
              </SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="h-[calc(100vh-120px)] mt-6">
              <div className="space-y-6">
                {/* Group Info */}
                <div className="flex flex-col items-center">
                  <Avatar className="h-24 w-24">
                    {group.profile_pic_url && (
                      <AvatarImage src={group.profile_pic_url} alt={group.name} />
                    )}
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                      {getInitials(group.name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="mt-4 text-center">
                    <h3 className="font-semibold text-lg">{group.name}</h3>
                    <Badge variant="secondary" className="mt-2">
                      <Users className="h-3 w-3 mr-1" />
                      {group.participant_count} participantes
                    </Badge>
                  </div>
                </div>
                
                <Separator />
                
                {/* Description */}
                {group.description && (
                  <>
                    <div>
                      <h4 className="text-sm font-medium mb-2">Descrição</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {group.description}
                      </p>
                    </div>
                    <Separator />
                  </>
                )}
                
                {/* Group info badges */}
                <div className="flex flex-wrap gap-2">
                  {group.is_announce && (
                    <Badge variant="outline">Somente admins enviam</Badge>
                  )}
                  {group.is_community && (
                    <Badge variant="outline">Comunidade</Badge>
                  )}
                </div>
                
                {/* Instance info */}
                {group.instance_name && (
                  <div className="text-xs text-muted-foreground">
                    Instância: {group.instance_name}
                  </div>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
        
        {/* Sync button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={syncMessages}
          disabled={syncing}
          title="Atualizar mensagens"
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Users className="h-12 w-12 mb-4 opacity-50" />
            <p>Nenhuma mensagem ainda</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={syncMessages}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Carregar Mensagens
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex}>
                {/* Date separator */}
                <div className="flex items-center justify-center my-4">
                  <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                    {group.date}
                  </div>
                </div>
                
                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        msg.is_from_me ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[70%] rounded-lg px-3 py-2',
                          msg.is_from_me
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        {/* Sender name (for incoming messages) */}
                        {!msg.is_from_me && (
                          <p className="text-xs font-medium text-primary mb-1">
                            {getSenderName(msg)}
                          </p>
                        )}
                        
                        {/* Message content */}
                        {msg.message_type === 'text' ? (
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                        ) : msg.message_type === 'image' ? (
                          <div className="space-y-1">
                            {msg.media_url && (
                              <img 
                                src={msg.media_url} 
                                alt="Imagem" 
                                className="rounded max-w-full"
                              />
                            )}
                            {msg.content && (
                              <p className="text-sm">{msg.content}</p>
                            )}
                          </div>
                        ) : msg.message_type === 'audio' ? (
                          <div className="flex items-center gap-2">
                            <Mic className="h-4 w-4" />
                            <span className="text-sm">Áudio</span>
                          </div>
                        ) : msg.message_type === 'document' ? (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm">Documento</span>
                          </div>
                        ) : (
                          <p className="text-sm italic">
                            [{msg.message_type}]
                          </p>
                        )}
                        
                        {/* Timestamp */}
                        <p className={cn(
                          'text-[10px] mt-1 text-right',
                          msg.is_from_me 
                            ? 'text-primary-foreground/70' 
                            : 'text-muted-foreground'
                        )}>
                          {formatMessageTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Input
              placeholder="Digite uma mensagem..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              className="pr-10"
            />
          </div>
          <Button
            size="icon"
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Mensagens de grupos não disparam fluxos automáticos
        </p>
      </div>
    </div>
  );
};
