import { useRef, useEffect, useState, useMemo } from 'react';
import { Phone, Video, MoreVertical, User, MessageSquare, Smartphone, ChevronDown, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { InboxContact, InboxMessage } from '@/types/inbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Instance colors for consistency
const instanceColors = [
  'bg-orange-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-yellow-500',
  'bg-red-500',
];

interface ChatPanelProps {
  contact: InboxContact | null;
  messages: InboxMessage[];
  loading: boolean;
  onSendMessage: (content: string, messageType?: string, mediaUrl?: string) => Promise<{ error?: string; data?: any }>;
  onToggleDetails: () => void;
  flows?: { id: string; name: string; is_active: boolean }[];
  onTriggerFlow?: (flowId: string) => void;
}

interface Instance {
  id: string;
  instance_name: string;
  label: string | null;
  phone_number: string | null;
}

export const ChatPanel = ({
  contact,
  messages,
  loading,
  onSendMessage,
  onToggleDetails,
  flows = [],
  onTriggerFlow,
}: ChatPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [addingLabel, setAddingLabel] = useState(false);
  const [contactLabels, setContactLabels] = useState<string[]>([]);

  // Fetch all instances once
  useEffect(() => {
    const fetchInstances = async () => {
      const { data } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, label, phone_number');
      if (data) {
        setInstances(data);
      }
    };
    fetchInstances();
  }, []);

  // Get instance color map
  const instanceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    instances.forEach((instance, index) => {
      map.set(instance.id, instanceColors[index % instanceColors.length]);
    });
    return map;
  }, [instances]);

  // Fetch instance name for current contact
  useEffect(() => {
    if (!contact?.instance_id) {
      setInstanceName(null);
      return;
    }
    const instance = instances.find(i => i.id === contact.instance_id);
    if (instance) {
      setInstanceName(instance.label || instance.instance_name);
    }
  }, [contact?.instance_id, instances]);

  // Fetch contact labels from tags field
  useEffect(() => {
    if (!contact) {
      setContactLabels([]);
      return;
    }
    const tags = (contact as any).tags;
    if (Array.isArray(tags)) {
      setContactLabels(tags);
    } else if (tags && typeof tags === 'object') {
      setContactLabels(Object.keys(tags));
    } else {
      setContactLabels([]);
    }
  }, [contact]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAddPagoLabel = async () => {
    if (!contact || addingLabel) return;

    setAddingLabel(true);
    try {
      // Get instance name
      const instance = instances.find(i => i.id === contact.instance_id);
      if (!instance) {
        toast.error('Instância não encontrada');
        return;
      }

      // Call Evolution API to add "Pago" label
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'handle-label',
          instanceName: instance.instance_name,
          remoteJid: `${contact.phone}@s.whatsapp.net`,
          labelName: 'Pago',
          labelAction: 'add',
        },
      });

      if (error) {
        console.error('Error adding label:', error);
        toast.error('Erro ao adicionar etiqueta');
        return;
      }

      // Save label locally
      const newTags = [...contactLabels, 'Pago'];
      await supabase
        .from('inbox_contacts')
        .update({ tags: newTags })
        .eq('id', contact.id);

      setContactLabels(newTags);
      toast.success('Etiqueta "Pago" adicionada!');
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao adicionar etiqueta');
    } finally {
      setAddingLabel(false);
    }
  };

  const handleRemoveLabel = async (labelName: string) => {
    if (!contact) return;

    try {
      const instance = instances.find(i => i.id === contact.instance_id);
      if (!instance) {
        toast.error('Instância não encontrada');
        return;
      }

      // Call Evolution API to remove label
      await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'handle-label',
          instanceName: instance.instance_name,
          remoteJid: `${contact.phone}@s.whatsapp.net`,
          labelName,
          labelAction: 'remove',
        },
      });

      // Update local storage
      const newTags = contactLabels.filter(t => t !== labelName);
      await supabase
        .from('inbox_contacts')
        .update({ tags: newTags })
        .eq('id', contact.id);

      setContactLabels(newTags);
      toast.success(`Etiqueta "${labelName}" removida!`);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao remover etiqueta');
    }
  };

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

  const instanceColor = contact.instance_id 
    ? instanceColorMap.get(contact.instance_id) || 'bg-muted'
    : 'bg-muted';

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
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{contact.name || contact.phone}</h3>
              {contactLabels.map((label) => (
                <Badge 
                  key={label} 
                  className="bg-green-500 text-white text-[10px] px-1.5 py-0 h-4 cursor-pointer hover:bg-green-600"
                  onClick={() => handleRemoveLabel(label)}
                  title="Clique para remover"
                >
                  {label}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{contact.phone}</p>
              {instanceName && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 font-normal gap-1 text-white border-0",
                    instanceColor
                  )}
                >
                  <Smartphone className="h-2.5 w-2.5" />
                  {instanceName}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Label dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" disabled={addingLabel}>
                <div className="flex items-center">
                  <Tag className="h-4 w-4" />
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleAddPagoLabel}>
                <Tag className="h-4 w-4 mr-2 text-green-500" />
                Marcar como Pago
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
      <ChatInput 
        onSendMessage={onSendMessage} 
        flows={flows} 
        onTriggerFlow={onTriggerFlow} 
        contactInstanceId={contact.instance_id}
      />
    </div>
  );
};
