import { useState, useEffect, useMemo } from 'react';
import { Search, Users, Send, Image, FileText, Mic, MoreVertical, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { WhatsAppGroup } from '@/types/groups';
import { useWhatsAppGroups } from '@/hooks/useWhatsAppGroups';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface GroupListProps {
  selectedGroup: WhatsAppGroup | null;
  onSelectGroup: (group: WhatsAppGroup) => void;
  selectedInstanceId?: string;
}

export const GroupList = ({
  selectedGroup,
  onSelectGroup,
  selectedInstanceId,
}: GroupListProps) => {
  const { groups, loading, refetch } = useWhatsAppGroups(selectedInstanceId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const query = searchQuery.toLowerCase();
    return groups.filter(g => 
      g.name.toLowerCase().includes(query)
    );
  }, [groups, searchQuery]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const selectAllGroups = () => {
    if (selectedGroups.size === filteredGroups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(filteredGroups.map(g => g.id)));
    }
  };

  const handleBulkAction = (action: string) => {
    if (selectedGroups.size === 0) {
      toast.error('Selecione pelo menos um grupo');
      return;
    }
    toast.info(`Ação "${action}" para ${selectedGroups.size} grupos - Em desenvolvimento`);
  };

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Grupos
          </h2>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => refetch()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar grupo..."
            className="pl-10 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant={bulkActionMode ? "secondary" : "outline"}
            onClick={() => {
              setBulkActionMode(!bulkActionMode);
              if (bulkActionMode) setSelectedGroups(new Set());
            }}
            className="text-xs"
          >
            {bulkActionMode ? 'Cancelar' : 'Ações em Massa'}
          </Button>
          
          {bulkActionMode && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={selectAllGroups}
                className="text-xs"
              >
                {selectedGroups.size === filteredGroups.length ? 'Desmarcar' : 'Selecionar Todos'}
              </Button>
            </>
          )}
        </div>

        {/* Bulk Action Buttons */}
        {bulkActionMode && selectedGroups.size > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="secondary" className="text-xs">
              {selectedGroups.size} selecionado(s)
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs gap-1">
                  <Send className="h-3 w-3" />
                  Enviar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleBulkAction('send-text')}>
                  <Send className="h-4 w-4 mr-2" />
                  Texto
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkAction('send-image')}>
                  <Image className="h-4 w-4 mr-2" />
                  Imagem
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkAction('send-audio')}>
                  <Mic className="h-4 w-4 mr-2" />
                  Áudio
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkAction('send-document')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Documento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs gap-1">
                  <MoreVertical className="h-3 w-3" />
                  Mais
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleBulkAction('change-name')}>
                  Alterar Nome
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkAction('change-photo')}>
                  Alterar Foto
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkAction('change-permissions')}>
                  Alterar Permissões
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Group List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum grupo encontrado</p>
            <p className="text-sm mt-2">
              Conecte uma instância para ver os grupos
            </p>
          </div>
        ) : (
          <div>
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                onClick={() => !bulkActionMode && onSelectGroup(group)}
                className={cn(
                  "flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors border-b border-border/50",
                  selectedGroup?.id === group.id && "bg-accent"
                )}
              >
                {bulkActionMode && (
                  <Checkbox
                    checked={selectedGroups.has(group.id)}
                    onCheckedChange={() => toggleGroupSelection(group.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                
                <Avatar className="h-12 w-12 border-2 border-background shadow-sm flex-shrink-0">
                  {group.profile_pic_url && (
                    <AvatarImage 
                      src={group.profile_pic_url} 
                      alt={group.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {getInitials(group.name)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {group.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>{group.participant_count} membros</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
