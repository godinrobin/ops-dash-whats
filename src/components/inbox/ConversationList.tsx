import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Smartphone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InboxContact } from '@/types/inbox';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface Instance {
  id: string;
  instance_name: string;
  label: string | null;
  phone_number: string | null;
}

interface ConversationListProps {
  contacts: InboxContact[];
  loading: boolean;
  selectedContact: InboxContact | null;
  onSelectContact: (contact: InboxContact) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
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

export const ConversationList = ({
  contacts,
  loading,
  selectedContact,
  onSelectContact,
  searchQuery,
  onSearchChange,
}: ConversationListProps) => {
  const [instances, setInstances] = useState<Instance[]>([]);

  // Fetch instances to get names
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
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return phone.slice(-2);
  };

  const formatPhoneDisplay = (phone: string): string => {
    // Format as +55 (11) 99999-9999 for Brazilian numbers
    if (phone.length >= 12 && phone.startsWith('55')) {
      const ddd = phone.slice(2, 4);
      const part1 = phone.slice(4, 9);
      const part2 = phone.slice(9);
      return `+55 (${ddd}) ${part1}-${part2}`;
    }
    return phone;
  };

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Conversas</h2>
          <Button size="icon" variant="ghost" className="h-8 w-8">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Lista de Conversas */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>Nenhuma conversa encontrada</p>
            <p className="text-sm mt-2">As conversas aparecerão aqui quando você receber mensagens</p>
          </div>
        ) : (
          <div>
            {contacts.map((contact) => {
              const instanceName = getInstanceName(contact.instance_id);
              const instancePhone = getInstancePhone(contact.instance_id);
              const instanceColor = getInstanceColor(contact.instance_id);
              
              return (
                <div
                  key={contact.id}
                  onClick={() => onSelectContact(contact)}
                  className={cn(
                    "flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/50 transition-colors border-b border-border/50",
                    selectedContact?.id === contact.id && "bg-accent"
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                      <AvatarImage 
                        src={contact.profile_pic_url || undefined} 
                        alt={contact.name || contact.phone}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {getInitials(contact.name, contact.phone)}
                      </AvatarFallback>
                    </Avatar>
                    {contact.unread_count > 0 && (
                      <Badge 
                        className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                        variant="destructive"
                      >
                        {contact.unread_count > 9 ? '9+' : contact.unread_count}
                      </Badge>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">
                        {contact.name || formatPhoneDisplay(contact.phone)}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {formatTime(contact.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {contact.name && (
                        <p className="text-sm text-muted-foreground truncate">
                          {formatPhoneDisplay(contact.phone)}
                        </p>
                      )}
                    </div>
                    {instanceName && (
                      <div className="flex items-center gap-1 mt-1">
                        <Smartphone className="h-3 w-3 text-muted-foreground" />
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px] px-1.5 py-0 h-4 font-normal text-white border-0",
                            instanceColor
                          )}
                        >
                          {instanceName}
                          {instancePhone && ` • ${instancePhone.slice(-4)}`}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
