import { useState, useMemo } from 'react';
import { Search, Users, Send, Image, FileText, Mic, MoreVertical, RefreshCw, MessageSquare } from 'lucide-react';
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
    <div className="w-80 border-r border-border flex flex-col bg-card flex-shrink-0 overflow-hidden items-center justify-center">
      <div className="text-center p-8">
        <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-semibold mb-2">Grupos</h3>
        <Badge variant="outline" className="text-orange-500 border-orange-500">
          Em breve
        </Badge>
        <p className="text-sm text-muted-foreground mt-4">
          Gerenciamento de grupos WhatsApp será disponibilizado em breve.
        </p>
        {onViewModeChange && (
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => onViewModeChange('conversations')}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Voltar para Conversas
          </Button>
        )}
      </div>
    </div>
  );
};
