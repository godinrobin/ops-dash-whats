import { useState, useMemo } from 'react';
import { Search, Users, RefreshCw, MessageSquare, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useInboxGroups, InboxGroup } from '@/hooks/useInboxGroups';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GroupListProps {
  selectedGroup: InboxGroup | null;
  onSelectGroup: (group: InboxGroup) => void;
  selectedInstanceId?: string;
  viewMode?: 'conversations' | 'groups';
  onViewModeChange?: (mode: 'conversations' | 'groups') => void;
}

export const GroupList = ({
  selectedGroup,
  onSelectGroup,
  selectedInstanceId,
  viewMode = 'groups',
  onViewModeChange,
}: GroupListProps) => {
  const { groups, loading, syncing, syncGroups, refetch } = useInboxGroups(selectedInstanceId);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const query = searchQuery.toLowerCase();
    return groups.filter(g => 
      g.name.toLowerCase().includes(query) ||
      g.description?.toLowerCase().includes(query)
    );
  }, [groups, searchQuery]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatLastMessage = (date: string | undefined) => {
    if (!date) return '';
    try {
      const msgDate = new Date(date);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return format(msgDate, 'HH:mm', { locale: ptBR });
      } else if (diffDays === 1) {
        return 'Ontem';
      } else if (diffDays < 7) {
        return format(msgDate, 'EEEE', { locale: ptBR });
      }
      return format(msgDate, 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return '';
    }
  };

  const handleSync = async () => {
    await syncGroups();
  };

  if (loading && groups.length === 0) {
    return (
      <div className="w-80 border-r border-border flex flex-col bg-card flex-shrink-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Grupos</h2>
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Grupos
            {groups.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {groups.length}
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleSync}
              disabled={syncing}
              title="Sincronizar grupos"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            {onViewModeChange && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onViewModeChange('conversations')}
                title="Voltar para conversas"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar grupos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Groups List */}
      <ScrollArea className="flex-1">
        {filteredGroups.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            {groups.length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Nenhum grupo encontrado
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sincronizando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sincronizar Grupos
                    </>
                  )}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum grupo corresponde à busca
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredGroups.map((group) => (
              <button
                key={group.id}
                className={cn(
                  'w-full p-3 flex items-start gap-3 text-left hover:bg-accent/50 transition-colors',
                  selectedGroup?.id === group.id && 'bg-accent'
                )}
                onClick={() => onSelectGroup(group)}
              >
                <Avatar className="h-12 w-12 flex-shrink-0">
                  {group.profile_pic_url && (
                    <AvatarImage src={group.profile_pic_url} alt={group.name} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {getInitials(group.name)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{group.name}</span>
                    {group.last_message_at && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatLastMessage(group.last_message_at)}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-xs text-muted-foreground truncate">
                      {group.last_message_preview || `${group.participant_count} participantes`}
                    </span>
                    {group.unread_count > 0 && (
                      <Badge className="h-5 min-w-[20px] px-1.5 flex-shrink-0 bg-primary text-primary-foreground">
                        {group.unread_count}
                      </Badge>
                    )}
                  </div>
                  
                  {group.instance_name && !selectedInstanceId && (
                    <span className="text-[10px] text-muted-foreground/60 mt-1 block truncate">
                      {group.instance_name}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
