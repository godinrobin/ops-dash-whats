import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Smartphone, Filter, PauseCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InboxContact } from '@/types/inbox';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { NewConversationDialog } from './NewConversationDialog';
import { formatPhoneDisplay } from '@/utils/phoneFormatter';

// Predefined label colors
const labelColors: Record<string, string> = {
  'pago': 'bg-green-500',
  'pendente': 'bg-yellow-500',
  'lead': 'bg-blue-500',
  'vip': 'bg-purple-500',
  'suporte': 'bg-orange-500',
};

const getLabelColor = (labelName: string): string => {
  return labelColors[labelName.toLowerCase()] || 'bg-gray-500';
};

interface Instance {
  id: string;
  instance_name: string;
  label: string | null;
  phone_number: string | null;
  status: string;
}

interface ConversationListProps {
  contacts: InboxContact[];
  loading: boolean;
  selectedContact: InboxContact | null;
  onSelectContact: (contact: InboxContact) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedLabel?: string;
  onLabelChange?: (label: string) => void;
  selectedFilter?: string;
  onFilterChange?: (filter: string) => void;
}

// Generate consistent colors for instances
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

type FilterType = 'all' | 'paid' | 'ignored' | 'unread' | 'read';

export const ConversationList = ({
  contacts,
  loading,
  selectedContact,
  onSelectContact,
  searchQuery,
  onSearchChange,
  selectedLabel = '',
  onLabelChange,
  selectedFilter = 'all',
  onFilterChange,
}: ConversationListProps) => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>(selectedFilter as FilterType);

  // Fetch instances to get names
  useEffect(() => {
    const fetchInstances = async () => {
      const { data } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, label, phone_number, status');
      
      if (data) {
        setInstances(data);
      }
    };
    fetchInstances();
  }, []);

  // Create a color map for instances
  const instanceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    instances.forEach((instance, index) => {
      map.set(instance.id, instanceColors[index % instanceColors.length]);
    });
    return map;
  }, [instances]);

  const getInstanceName = (instanceId: string | null): string | null => {
    if (!instanceId) return null;
    const instance = instances.find(i => i.id === instanceId);
    return instance?.label || instance?.instance_name || null;
  };

  const getInstancePhone = (instanceId: string | null): string | null => {
    if (!instanceId) return null;
    const instance = instances.find(i => i.id === instanceId);
    return instance?.phone_number || null;
  };

  const getInstanceColor = (instanceId: string | null): string => {
    if (!instanceId) return 'bg-muted';
    return instanceColorMap.get(instanceId) || 'bg-muted';
  };

  const formatTime = (date: string | null) => {
    if (!date) return '';
    const distance = formatDistanceToNow(new Date(date), { addSuffix: false, locale: ptBR });
    // Shorten common phrases to fit in the UI
    return distance
      .replace('menos de um minuto', '< 1m')
      .replace('cerca de ', '')
      .replace('mais de ', '+')
      .replace('quase ', '~')
      .replace('minutos', 'min')
      .replace('minuto', 'min')
      .replace('horas', 'h')
      .replace('hora', 'h')
      .replace('dias', 'd')
      .replace('dia', 'd')
      .replace('meses', 'me')
      .replace('mês', 'me')
      .replace('anos', 'a')
      .replace('ano', 'a');
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name && name.trim()) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    // For LID-only contacts (long phone), show "?" 
    if (phone.length > 15) return '?';
    return phone.slice(-2);
  };
  
  // Helper to check if this is a LID-only contact (no real phone)
  const isLidContact = (phone: string, remoteJid?: string) => {
    return phone.length > 15 || (remoteJid && remoteJid.includes('@lid'));
  };
  
  // Helper to format display name - show name if available, otherwise phone
  const getDisplayName = (contact: InboxContact) => {
    const remoteJid = (contact as any).remote_jid;
    if (isLidContact(contact.phone, remoteJid)) {
      // For LID contacts, show name if available, otherwise "Desconhecido"
      return contact.name?.trim() || 'Desconhecido';
    }
    // Show name if available, otherwise show phone number
    return contact.name?.trim() || formatPhoneDisplay(contact.phone);
  };
  
  // Helper to get subtitle - show phone for contacts with names
  const getSubtitle = (contact: InboxContact) => {
    const remoteJid = (contact as any).remote_jid;
    if (isLidContact(contact.phone, remoteJid)) {
      // Show last 6 chars of LID as identifier
      const shortId = contact.phone.slice(-6);
      return `Lead via anúncio • ID ${shortId}`;
    }
    // If contact has a name, show phone as subtitle
    if (contact.name?.trim()) {
      return formatPhoneDisplay(contact.phone);
    }
    return null;
  };

  const handleContactCreated = (contact: InboxContact) => {
    onSelectContact(contact);
  };

  // Get all unique labels from contacts
  const allLabels = useMemo(() => {
    const labelsSet = new Set<string>();
    contacts.forEach(contact => {
      const tags = Array.isArray((contact as any).tags) ? (contact as any).tags : [];
      tags.forEach((tag: string) => labelsSet.add(tag));
    });
    // Remove "Pago" from dropdown since it has its own tab filter
    return Array.from(labelsSet).filter(label => label.toLowerCase() !== 'pago');
  }, [contacts]);

  // Filter contacts based on active filter (tabs: Todos/Pagos/Ignorados/Não lidas/Lidas)
  // Note: The label dropdown filter is already applied by the parent component
  const filteredByType = useMemo(() => {
    return contacts.filter(contact => {
      const tags = Array.isArray((contact as any).tags) ? (contact as any).tags : [];
      const hasPagoTag = tags.some((tag: string) => tag.toLowerCase() === 'pago');
      const isIgnored = (contact as any).is_ignored === true;
      const isUnread = contact.unread_count > 0;

      switch (activeFilter) {
        case 'paid':
          return hasPagoTag && !isIgnored;
        case 'ignored':
          return isIgnored;
        case 'unread':
          return isUnread && !isIgnored;
        case 'read':
          return !isUnread && !isIgnored;
        case 'all':
        default:
          // "Todos" shows all contacts (not ignored)
          return !isIgnored;
      }
    });
  }, [contacts, activeFilter]);

  const handleFilterChange = (filter: FilterType) => {
    setActiveFilter(filter);
    onFilterChange?.(filter);
  };

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'paid', label: 'Pagos' },
    { key: 'ignored', label: 'Ignorados' },
  ];

  const readFilterButtons: { key: FilterType; label: string }[] = [
    { key: 'unread', label: 'Não lidas' },
    { key: 'read', label: 'Lidas' },
  ];

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Conversas</h2>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8"
            onClick={() => setShowNewConversation(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Search and Label Filter Side by Side */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-10 h-9"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          {allLabels.length > 0 && (
          <Select value={selectedLabel} onValueChange={(value) => onLabelChange?.(value)}>
              <SelectTrigger className="h-9 w-28 text-xs">
                <div className="flex items-center gap-1">
                  <Filter className="h-3 w-3" />
                  <span className="truncate">Etiqueta</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {allLabels.map((label) => (
                  <SelectItem key={label} value={label}>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", getLabelColor(label))} />
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Filter Tabs - Row 1: Todos/Pagos/Ignorados */}
        <div className="flex gap-2 mt-3">
          {filterButtons.map((filter) => (
            <button
              key={filter.key}
              onClick={() => handleFilterChange(filter.key)}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                activeFilter === filter.key
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-orange-500/10 text-orange-600 border-orange-500/30 hover:bg-orange-500/20"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Filter Tabs - Row 2: Não lidas/Lidas */}
        <div className="flex gap-2 mt-2">
          {readFilterButtons.map((filter) => (
            <button
              key={filter.key}
              onClick={() => handleFilterChange(filter.key)}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                activeFilter === filter.key
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/20"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Conversas */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredByType.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>Nenhuma conversa encontrada</p>
            <p className="text-sm mt-2">
              {activeFilter === 'paid' 
                ? 'Nenhum contato com etiqueta "Pago"'
                : activeFilter === 'ignored'
                ? 'Nenhum contato ignorado'
                : 'As conversas aparecerão aqui quando você receber mensagens'}
            </p>
          </div>
        ) : (
          <div>
            {filteredByType.map((contact) => {
              const instanceName = getInstanceName(contact.instance_id);
              const instancePhone = getInstancePhone(contact.instance_id);
              const instanceColor = getInstanceColor(contact.instance_id);
              const contactTags = Array.isArray((contact as any).tags) ? (contact as any).tags : [];
              
              return (
                <div
                  key={contact.id}
                  onClick={() => onSelectContact(contact)}
                  className={cn(
                    "flex items-start gap-3 p-3 pr-4 cursor-pointer hover:bg-accent/50 transition-colors border-b border-border/50 min-h-0 overflow-hidden",
                    selectedContact?.id === contact.id && "bg-accent"
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                      <AvatarImage 
                        src={contact.profile_pic_url || undefined} 
                        alt={contact.name || contact.phone}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                        {getInitials(contact.name, contact.phone)}
                      </AvatarFallback>
                    </Avatar>
                    {(contact as any).flow_paused && (
                      <div 
                        className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-orange-500 rounded-full flex items-center justify-center"
                        title="Funil pausado"
                      >
                        <PauseCircle className="h-3 w-3 text-white" />
                      </div>
                    )}
                    {contact.unread_count > 0 && (
                      <Badge 
                        className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                        variant="destructive"
                      >
                        {contact.unread_count > 9 ? '9+' : contact.unread_count}
                      </Badge>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate flex-1 min-w-0">
                        {getDisplayName(contact)}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatTime(contact.last_message_at)}
                      </span>
                    </div>
                    {getSubtitle(contact) && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {getSubtitle(contact)}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {instanceName && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[9px] px-1 py-0 h-3.5 font-normal text-white border-0 flex items-center gap-0.5",
                            instanceColor
                          )}
                        >
                          <Smartphone className="h-2 w-2" />
                          {instanceName}
                          {instancePhone && ` • ${instancePhone.slice(-4)}`}
                        </Badge>
                      )}
                      {contactTags.slice(0, 2).map((tag: string) => (
                        <Badge
                          key={tag}
                          className={cn(
                            "text-[9px] px-1 py-0 h-3.5 font-normal text-white border-0",
                            getLabelColor(tag)
                          )}
                        >
                          {tag}
                        </Badge>
                      ))}
                      {contactTags.length > 2 && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 font-normal">
                          +{contactTags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        instances={instances}
        onContactCreated={handleContactCreated}
      />
    </div>
  );
};
