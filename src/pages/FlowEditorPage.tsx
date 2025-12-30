import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Settings, Play, Smartphone } from 'lucide-react';
import { FlowCanvas } from '@/components/flow-builder/FlowCanvas';
import { FlowAnalyticsBar } from '@/components/flow-builder/FlowAnalyticsBar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { FlowNode, FlowEdge, InboxFlow } from '@/types/inbox';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { DateFilter } from '@/hooks/useFlowAnalytics';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface Instance {
  id: string;
  instance_name: string;
  label: string | null;
  phone_number: string | null;
  status: string;
}

const FlowEditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [flow, setFlow] = useState<InboxFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'keyword' | 'all' | 'schedule'>('keyword');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [pauseOnMedia, setPauseOnMedia] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [assignedInstances, setAssignedInstances] = useState<string[]>([]);
  const [analyticsDateFilter, setAnalyticsDateFilter] = useState<DateFilter>('today');

  // Dynamic activity tracking based on route
  const isAutomatiZap = location.pathname.startsWith('/inbox');
  const systemName = isAutomatiZap ? "Automati-Zap Editor" : "DisparaZap Editor";
  useActivityTracker('page_visit', systemName);

  // Fetch instances
  useEffect(() => {
    const fetchInstances = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, label, phone_number, status')
        .eq('user_id', user.id);
      if (data) {
        setInstances(data);
      }
    };
    fetchInstances();
  }, [user]);

  // Determine the back route based on where we came from
  const getBackRoute = () => {
    if (location.pathname.startsWith('/inbox')) {
      return '/inbox/flows';
    }
    return '/disparador';
  };

  useEffect(() => {
    const fetchOrCreateFlow = async () => {
      if (!user) return;

      // If no id, create a new flow
      if (!id || id === 'novo') {
        try {
          const { data, error } = await supabase
            .from('inbox_flows')
            .insert({
              user_id: user.id,
              name: 'Novo Fluxo',
              description: '',
              nodes: [],
              edges: [],
              trigger_type: 'keyword',
              trigger_keywords: [],
              assigned_instances: [],
              is_active: false,
            })
            .select()
            .single();

          if (error) throw error;

          // Navigate to the new flow - preserve the context (inbox vs disparazap)
          const basePath = location.pathname.startsWith('/inbox') ? '/inbox/flows' : '/disparazap/fluxos';
          navigate(`${basePath}/${data.id}`, { replace: true });
          return;
        } catch (error: unknown) {
          console.error('Error creating flow:', error);
          toast.error('Erro ao criar fluxo');
          navigate(getBackRoute());
          return;
        }
      }

      // Fetch existing flow
      try {
        const { data, error } = await supabase
          .from('inbox_flows')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (error) throw error;

        const flowData: InboxFlow = {
          ...data,
          nodes: (data.nodes as unknown as FlowNode[]) || [],
          edges: (data.edges as unknown as FlowEdge[]) || [],
          trigger_type: data.trigger_type as 'keyword' | 'all' | 'schedule',
          trigger_keywords: data.trigger_keywords || [],
          assigned_instances: data.assigned_instances || [],
        };

        setFlow(flowData);
        setFlowName(data.name);
        setFlowDescription(data.description || '');
        setTriggerType(data.trigger_type as 'keyword' | 'all' | 'schedule');
        setTriggerKeywords(data.trigger_keywords?.join(', ') || '');
        setIsActive(data.is_active);
        setPauseOnMedia(data.pause_on_media || false);
        setAssignedInstances(data.assigned_instances || []);
      } catch (error: unknown) {
        console.error('Error fetching flow:', error);
        toast.error('Erro ao carregar fluxo');
        navigate(getBackRoute());
      } finally {
        setLoading(false);
      }
    };

    fetchOrCreateFlow();
  }, [id, user, navigate, location.pathname]);

  const handleSave = async (nodes: FlowNode[], edges: FlowEdge[]) => {
    if (!id || !user) return;

    setSaving(true);
    try {
      // Clean up orphaned edges - remove edges that reference non-existent nodes
      const nodeIds = new Set(nodes.map(n => n.id));
      const cleanedEdges = edges.filter(edge => {
        const sourceExists = nodeIds.has(edge.source);
        const targetExists = nodeIds.has(edge.target);
        if (!sourceExists || !targetExists) {
          console.log(`[FlowEditor] Removing orphan edge: ${edge.source} -> ${edge.target} (source exists: ${sourceExists}, target exists: ${targetExists})`);
        }
        return sourceExists && targetExists;
      });

      if (cleanedEdges.length !== edges.length) {
        console.log(`[FlowEditor] Cleaned ${edges.length - cleanedEdges.length} orphaned edges`);
      }

      const { error } = await supabase
        .from('inbox_flows')
        .update({
          name: flowName,
          description: flowDescription,
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(cleanedEdges)),
          trigger_type: triggerType,
          trigger_keywords: triggerKeywords.split(',').map(k => k.trim()).filter(Boolean),
          assigned_instances: assignedInstances,
          is_active: isActive,
          pause_on_media: pauseOnMedia,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Fluxo salvo com sucesso');
    } catch (error: unknown) {
      console.error('Error saving flow:', error);
      toast.error('Erro ao salvar fluxo');
    } finally {
      setSaving(false);
    }
  };

  const handleInstanceToggle = (instanceId: string) => {
    setAssignedInstances(prev => 
      prev.includes(instanceId)
        ? prev.filter(id => id !== instanceId)
        : [...prev, instanceId]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="h-14 md:h-16 shrink-0" /> {/* Spacer for fixed header */}
      
      <div className="border-b border-border px-4 py-2 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(getBackRoute())} title={isAutomatiZap ? "Voltar para AutomatiZap" : "Voltar para DisparaZap"}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="w-64 font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              id="flow-active"
              className={isActive 
                ? "data-[state=checked]:bg-green-500" 
                : "data-[state=unchecked]:bg-red-500"
              }
            />
            <Label htmlFor="flow-active" className="text-sm">
              {isActive ? 'Ativo' : 'Inativo'}
            </Label>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-1" />
                Configurações
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Configurações do Fluxo</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label>Nome do Fluxo</Label>
                  <Input
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={flowDescription}
                    onChange={(e) => setFlowDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Gatilho</Label>
                  <Select
                    value={triggerType}
                    onValueChange={(value) => setTriggerType(value as 'keyword' | 'all' | 'schedule')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">Palavra-chave</SelectItem>
                      <SelectItem value="all">Todas as mensagens</SelectItem>
                      <SelectItem value="schedule">Agendado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {triggerType === 'keyword' && (
                  <div className="space-y-2">
                    <Label>Palavras-chave (separadas por vírgula)</Label>
                    <Textarea
                      value={triggerKeywords}
                      onChange={(e) => setTriggerKeywords(e.target.value)}
                      placeholder="oi, olá, bom dia, quero comprar"
                      rows={2}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Instâncias (Números)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Selecione quais números receberão este fluxo. Se nenhum for selecionado, o fluxo será aplicado a todos.
                  </p>
                  <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                    {instances.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma instância encontrada</p>
                    ) : (
                      instances.map((instance) => (
                        <div 
                          key={instance.id} 
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                          onClick={() => handleInstanceToggle(instance.id)}
                        >
                          <Checkbox 
                            checked={assignedInstances.includes(instance.id)}
                            onCheckedChange={() => handleInstanceToggle(instance.id)}
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium">
                              {instance.label || instance.instance_name}
                            </span>
                            {instance.phone_number && (
                              <span className="text-xs text-muted-foreground ml-2">
                                {instance.phone_number}
                              </span>
                            )}
                          </div>
                          <Badge 
                            variant="outline" 
                            className={instance.status === 'connected' || instance.status === 'open' ? 'bg-green-500/20 text-green-500 border-green-500' : 'bg-red-500/20 text-red-500 border-red-500'}
                          >
                            {instance.status === 'connected' || instance.status === 'open' ? 'Online' : 'Offline'}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                  {assignedInstances.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {assignedInstances.map(id => {
                        const inst = instances.find(i => i.id === id);
                        return inst ? (
                          <Badge key={id} variant="secondary" className="text-xs">
                            {inst.label || inst.instance_name}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label>Pausar ao receber imagem/PDF</Label>
                    <p className="text-xs text-muted-foreground">
                      Pausa automaticamente o fluxo quando o contato enviar uma imagem ou documento
                    </p>
                  </div>
                  <Switch
                    checked={pauseOnMedia}
                    onCheckedChange={setPauseOnMedia}
                    className={pauseOnMedia 
                      ? "data-[state=checked]:bg-green-500" 
                      : "data-[state=unchecked]:bg-red-500"
                    }
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <Label>Fluxo Ativo</Label>
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    className={isActive 
                      ? "data-[state=checked]:bg-green-500" 
                      : "data-[state=unchecked]:bg-red-500"
                    }
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="outline" size="sm" disabled>
            <Play className="h-4 w-4 mr-1" />
            Testar
          </Button>
        </div>
      </div>

      {/* Analytics bar - only show when flow has ID */}
      {id && (
        <FlowAnalyticsBar
          flowId={id}
          dateFilter={analyticsDateFilter}
          onDateFilterChange={setAnalyticsDateFilter}
        />
      )}

      <div className="flex-1 min-h-0">
        {flow && (
          <FlowCanvas
            initialNodes={flow.nodes}
            initialEdges={flow.edges}
            onSave={handleSave}
            triggerType={triggerType}
            triggerKeywords={triggerKeywords.split(',').map(k => k.trim()).filter(Boolean)}
            onUpdateFlowSettings={(settings) => {
              if (settings.triggerType) setTriggerType(settings.triggerType as 'keyword' | 'all' | 'schedule');
              if (settings.triggerKeywords) setTriggerKeywords(settings.triggerKeywords.join(', '));
            }}
          />
        )}
      </div>
    </div>
  );
};

export default FlowEditorPage;
