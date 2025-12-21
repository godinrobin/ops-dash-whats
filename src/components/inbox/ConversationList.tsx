import { Search, Plus } from 'lucide-react';
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

interface ConversationListProps {
  contacts: InboxContact[];
  loading: boolean;
  selectedContact: InboxContact | null;
  onSelectContact: (contact: InboxContact) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const ConversationList = ({
  contacts,
  loading,
  selectedContact,
  onSelectContact,
  searchQuery,
  onSearchChange,
}: ConversationListProps) => {
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
            {contacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => onSelectContact(contact)}
                className={cn(
                  "flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/50 transition-colors border-b border-border/50",
                  selectedContact?.id === contact.id && "bg-accent"
                )}
              >
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={contact.profile_pic_url || undefined} />
                    <AvatarFallback>
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
                      {contact.name || contact.phone}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(contact.last_message_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {contact.phone}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
