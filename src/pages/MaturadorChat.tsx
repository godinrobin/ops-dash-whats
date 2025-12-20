import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Loader2, MessageSquare, Search, Mic, Image, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
}

interface Conversation {
  id: string;
  name: string;
  chip_a_id: string | null;
  chip_b_id: string | null;
  topics: string[];
}

interface Message {
  id: string;
  body: string;
  message_type: string;
  from_instance_id: string;
  to_instance_id: string;
  created_at: string;
  status: string;
}

export default function MaturadorChat() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [instances, setInstances] = useState<Map<string, Instance>>(new Map());
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations and instances
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // Fetch instances
        const { data: instancesData } = await supabase
          .from('maturador_instances')
          .select('id, instance_name, phone_number, label')
          .eq('user_id', user.id);

        const instanceMap = new Map<string, Instance>();
        (instancesData || []).forEach(inst => {
          instanceMap.set(inst.id, inst);
        });
        setInstances(instanceMap);

        // Fetch conversations with message counts
        const { data: conversationsData } = await supabase
          .from('maturador_conversations')
          .select('id, name, chip_a_id, chip_b_id, topics')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        const parsedConversations = (conversationsData || []).map(conv => ({
          ...conv,
          topics: Array.isArray(conv.topics) ? conv.topics.map(t => String(t)) : [],
        }));

        setConversations(parsedConversations);

        // Check for conversation param
        const convId = searchParams.get('conversation');
        if (convId) {
          const conv = parsedConversations.find(c => c.id === convId);
          if (conv) {
            setSelectedConversation(conv);
          }
        }

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, searchParams]);

  // Fetch messages when conversation is selected
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedConversation) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);
      try {
        const { data } = await supabase
          .from('maturador_messages')
          .select('*')
          .eq('conversation_id', selectedConversation.id)
          .order('created_at', { ascending: true });

        setMessages(data || []);
      } catch (error) {
        console.error('Error fetching messages:', error);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [selectedConversation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getInstanceName = (id: string) => {
    const instance = instances.get(id);
    if (!instance) return 'Desconhecido';
    return instance.label || instance.phone_number || instance.instance_name;
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return `Ontem ${format(date, 'HH:mm')}`;
    }
    return format(date, 'dd/MM HH:mm', { locale: ptBR });
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'audio':
        return <Mic className="h-3 w-3" />;
      case 'image':
        return <Image className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  const getMessageTypeBadge = (type: string) => {
    switch (type) {
      case 'audio':
        return <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30"><Mic className="h-3 w-3 mr-1" />Áudio</Badge>;
      case 'image':
        return <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30"><Image className="h-3 w-3 mr-1" />Imagem</Badge>;
      default:
        return null;
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/maturador')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Histórico de Conversas</h1>
            <p className="text-muted-foreground text-sm">Visualize todas as mensagens trocadas</p>
          </div>
        </div>

        {/* Main Layout */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left Panel - Conversation List */}
          <Card className="w-80 flex flex-col">
            <CardHeader className="py-3 px-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar conversas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full">
                {filteredConversations.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhuma conversa encontrada</p>
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => setSelectedConversation(conv)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          selectedConversation?.id === conv.id
                            ? 'bg-primary/10 border border-primary/20'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div className="font-medium text-sm truncate">{conv.name}</div>
                        <div className="text-xs text-muted-foreground truncate mt-1">
                          {getInstanceName(conv.chip_a_id || '')} ↔ {getInstanceName(conv.chip_b_id || '')}
                        </div>
                        {conv.topics.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {conv.topics.slice(0, 2).map((topic, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {topic}
                              </Badge>
                            ))}
                            {conv.topics.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{conv.topics.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right Panel - Chat View */}
          <Card className="flex-1 flex flex-col">
            {!selectedConversation ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selecione uma conversa para ver o histórico</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <CardHeader className="py-3 px-4 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{selectedConversation.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {getInstanceName(selectedConversation.chip_a_id || '')} ↔ {getInstanceName(selectedConversation.chip_b_id || '')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{messages.length} mensagens</Badge>
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-600">
                        {messages.filter(m => m.message_type === 'audio').length} áudios
                      </Badge>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600">
                        {messages.filter(m => m.message_type === 'image').length} imagens
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                {/* Messages Area */}
                <CardContent className="flex-1 p-4 overflow-hidden">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhuma mensagem ainda</p>
                      </div>
                    </div>
                  ) : (
                    <ScrollArea className="h-full pr-4">
                      <div className="space-y-3">
                        {messages.map((message, index) => {
                          const isFromA = message.from_instance_id === selectedConversation.chip_a_id;
                          const showDate = index === 0 || 
                            new Date(message.created_at).toDateString() !== 
                            new Date(messages[index - 1].created_at).toDateString();

                          return (
                            <div key={message.id}>
                              {showDate && (
                                <div className="flex justify-center my-4">
                                  <Badge variant="secondary" className="text-xs">
                                    {isToday(new Date(message.created_at))
                                      ? 'Hoje'
                                      : isYesterday(new Date(message.created_at))
                                      ? 'Ontem'
                                      : format(new Date(message.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                                  </Badge>
                                </div>
                              )}
                              <div className={`flex ${isFromA ? 'justify-start' : 'justify-end'}`}>
                                <div
                                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                                    isFromA
                                      ? 'bg-muted rounded-bl-none'
                                      : 'bg-primary text-primary-foreground rounded-br-none'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs font-medium ${isFromA ? 'text-muted-foreground' : 'text-primary-foreground/80'}`}>
                                      {getInstanceName(message.from_instance_id)}
                                    </span>
                                    {getMessageTypeBadge(message.message_type)}
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
                                  <div className={`text-xs mt-1 ${isFromA ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                                    {formatMessageDate(message.created_at)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
