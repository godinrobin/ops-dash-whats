import { useRef, useEffect, useState, useMemo } from 'react';
import { User, MessageSquare, Smartphone, ChevronDown, Tag, X, Plus } from 'lucide-react';
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
  const [newLabelInput, setNewLabelInput] = useState('');
  const [showNewLabelInput, setShowNewLabelInput] = useState(false);

  // Predefined labels with colors
  const predefinedLabels = [
    { name: 'Pago', color: 'bg-green-500' },
    { name: 'Pendente', color: 'bg-yellow-500' },
    { name: 'Lead', color: 'bg-blue-500' },
    { name: 'VIP', color: 'bg-purple-500' },
    { name: 'Suporte', color: 'bg-orange-500' },
  ];

  const getLabelColor = (labelName: string) => {
    const predefined = predefinedLabels.find(l => l.name.toLowerCase() === labelName.toLowerCase());
    return predefined?.color || 'bg-gray-500';
  };

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

  const handleAddLabel = async (labelName: string) => {
    if (!contact || addingLabel || contactLabels.includes(labelName)) return;

    setAddingLabel(true);
    try {
      // Save label locally only (no Evolution API call)
      const newTags = [...contactLabels, labelName];
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ tags: newTags })
        .eq('id', contact.id);

      if (error) {
        console.error('Error adding label:', error);
        toast.error('Erro ao adicionar etiqueta');
        return;
      }

      setContactLabels(newTags);
      toast.success(`Etiqueta "${labelName}" adicionada!`);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao adicionar etiqueta');
    } finally {
      setAddingLabel(false);
      setShowNewLabelInput(false);
      setNewLabelInput('');
    }
  };

  const handleRemoveLabel = async (labelName: string) => {
    if (!contact) return;

    try {
      // Update local storage only (no Evolution API call)
      const newTags = contactLabels.filter(t => t !== labelName);
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ tags: newTags })
        .eq('id', contact.id);

      if (error) {
        console.error('Error removing label:', error);
        toast.error('Erro ao remover etiqueta');
        return;
      }

      setContactLabels(newTags);
      toast.success(`Etiqueta "${labelName}" removida!`);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao remover etiqueta');
    }
  };

  const handleAddCustomLabel = () => {
    if (newLabelInput.trim()) {
      handleAddLabel(newLabelInput.trim());
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
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{contact.name || contact.phone}</h3>
              {contactLabels.map((label) => (
                <Badge 
                  key={label} 
                  className={cn(
                    "text-white text-[10px] px-1.5 py-0 h-4 cursor-pointer flex items-center gap-1",
                    getLabelColor(label)
                  )}
                  onClick={() => handleRemoveLabel(label)}
                  title="Clique para remover"
                >
                  {label}
                  <X className="h-2.5 w-2.5" />
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
            <DropdownMenuContent align="end" className="w-48">
              {predefinedLabels.map((label) => (
                <DropdownMenuItem 
                  key={label.name}
                  onClick={() => handleAddLabel(label.name)}
                  disabled={contactLabels.includes(label.name)}
                  className="flex items-center gap-2"
                >
                  <div className={cn("w-3 h-3 rounded-full", label.color)} />
                  {label.name}
                  {contactLabels.includes(label.name) && (
                    <span className="text-xs text-muted-foreground ml-auto">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
              <div className="border-t my-1" />
              {showNewLabelInput ? (
                <div className="px-2 py-1.5 flex gap-1">
                  <input
                    type="text"
                    placeholder="Nova etiqueta..."
                    value={newLabelInput}
                    onChange={(e) => setNewLabelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCustomLabel();
                      if (e.key === 'Escape') {
                        setShowNewLabelInput(false);
                        setNewLabelInput('');
                      }
                    }}
                    className="flex-1 text-sm bg-transparent border-b border-border focus:outline-none px-1"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleAddCustomLabel}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <DropdownMenuItem onClick={() => setShowNewLabelInput(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova etiqueta...
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onToggleDetails}>
            <User className="h-4 w-4" />
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
