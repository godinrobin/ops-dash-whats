import { useState, useEffect } from 'react';
import { MessageSquare, Filter, Zap, Tag, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { InboxMenu } from './InboxMenu';

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
  const [syncing, setSyncing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchInstances = async () => {
      const { data } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, phone_number, status')
        .eq('user_id', user.id)
        .eq('status', 'connected');
      
      if (data) {
        setInstances(data);
      }
    };

    fetchInstances();
  }, [user]);

  const syncContacts = async () => {
    if (syncing) return;
    
    if (instances.length === 0) {
      toast.error('Nenhuma instância conectada. Conecte um número no Maturador primeiro.');
      return;
    }

    setSyncing(true);
    let totalImported = 0;

    try {
      // Run all instance syncs in parallel for faster completion
      const results = await Promise.allSettled(
        instances.map(instance => 
          supabase.functions.invoke('sync-inbox-contacts', {
            body: { instanceId: instance.id }
          })
        )
      );

      // Count successful imports
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.data) {
          totalImported += result.value.data.imported || 0;
        }
      }

      if (totalImported > 0) {
        toast.success(`${totalImported} contatos importados com sucesso!`);
      } else {
        toast.info('Nenhum novo contato encontrado');
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Erro ao sincronizar contatos');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="w-16 border-r border-border flex flex-col items-center py-4 bg-card">
        <div className="space-y-2 flex flex-col items-center">
          <Button
            variant="ghost"
            size="icon"
            className="w-10 h-10"
            onClick={() => navigate('/inbox')}
            title="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

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
            onClick={() => setMenuOpen(true)}
            title="Tags"
          >
            <Tag className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="w-10 h-10"
            onClick={syncContacts}
            disabled={syncing}
            title="Sincronizar Contatos"
          >
            <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="mt-auto space-y-2">
          <Select 
            value={selectedInstanceId || 'all'} 
            onValueChange={(value) => onInstanceChange(value === 'all' ? undefined : value)}
          >
            <SelectTrigger className="w-10 h-10 p-0 border-0 bg-orange-500 hover:bg-orange-600 text-white rounded-lg" title="Filtrar por número">
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
        </div>
      </div>

      <InboxMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
};
