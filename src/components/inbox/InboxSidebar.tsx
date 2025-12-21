import { useState, useEffect } from 'react';
import { MessageSquare, Filter, Settings, Zap, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
}

interface InboxSidebarProps {
  selectedInstanceId?: string;
  onInstanceChange: (instanceId: string | undefined) => void;
}

export const InboxSidebar = ({ selectedInstanceId, onInstanceChange }: InboxSidebarProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [instances, setInstances] = useState<Instance[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchInstances = async () => {
      const { data } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, phone_number, status')
        .eq('user_id', user.id);
      
      if (data) {
        setInstances(data);
      }
    };

    fetchInstances();
  }, [user]);

  return (
    <div className="w-16 border-r border-border flex flex-col items-center py-4 bg-card">
      <div className="space-y-2 flex flex-col items-center">
        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10"
          title="Conversas"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10"
          onClick={() => navigate('/inbox/flows')}
          title="Fluxos"
        >
          <Zap className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10"
          title="Tags"
        >
          <Tag className="h-5 w-5" />
        </Button>
      </div>

      <div className="mt-auto space-y-2">
        <Select 
          value={selectedInstanceId || 'all'} 
          onValueChange={(value) => onInstanceChange(value === 'all' ? undefined : value)}
        >
          <SelectTrigger className="w-10 h-10 p-0 border-0" title="Filtrar por número">
            <Filter className="h-5 w-5" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os números</SelectItem>
            {instances.map(instance => (
              <SelectItem key={instance.id} value={instance.id}>
                {instance.phone_number || instance.instance_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10"
          title="Configurações"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};
