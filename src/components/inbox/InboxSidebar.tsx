import { useState, useEffect } from 'react';
import { MessageSquare, Filter, Settings, Zap, Tag, RefreshCw, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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
  const [configuringWebhook, setConfiguringWebhook] = useState(false);

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
      for (const instance of instances) {
        const { data, error } = await supabase.functions.invoke('sync-inbox-contacts', {
          body: { instanceId: instance.id }
        });

        if (error) {
          console.error('Sync error for instance:', instance.instance_name, error);
          continue;
        }

        totalImported += data?.imported || 0;
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

  const configureWebhooks = async () => {
    if (configuringWebhook) return;
    
    if (instances.length === 0) {
      toast.error('Nenhuma instância conectada. Conecte um número no Maturador primeiro.');
      return;
    }

    setConfiguringWebhook(true);
    let configured = 0;

    try {
      for (const instance of instances) {
        const { data, error } = await supabase.functions.invoke('configure-webhook', {
          body: { instanceId: instance.id }
        });

        if (error) {
          console.error('Webhook config error for instance:', instance.instance_name, error);
          continue;
        }

        if (data?.success) {
          configured++;
        }
      }

      if (configured > 0) {
        toast.success(`Webhook configurado em ${configured} instância(s)! Mensagens em tempo real ativadas.`);
      } else {
        toast.error('Não foi possível configurar o webhook. Verifique sua Evolution API.');
      }
    } catch (error) {
      console.error('Webhook config error:', error);
      toast.error('Erro ao configurar webhook');
    } finally {
      setConfiguringWebhook(false);
    }
  };

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

        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10"
          onClick={configureWebhooks}
          disabled={configuringWebhook}
          title="Configurar Tempo Real (Webhook)"
        >
          <Webhook className={`h-5 w-5 ${configuringWebhook ? 'animate-pulse' : ''}`} />
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
