import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Zap, Edit2, Trash2, Copy, ArrowLeft, Smartphone } from 'lucide-react';
import { useInboxFlows } from '@/hooks/useInboxFlows';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const FlowListPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { flows, loading, createFlow, deleteFlow, toggleFlowActive, updateFlow } = useInboxFlows();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [instances, setInstances] = useState<Array<{ id: string; instance_name: string; phone_number: string | null; label: string | null }>>([]);
  const [showInstancesDialog, setShowInstancesDialog] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      fetchInstances();
    }
  }, [user]);

  const fetchInstances = async () => {
    const { data } = await supabase
      .from('maturador_instances')
      .select('id, instance_name, phone_number, label')
      .eq('user_id', user?.id)
      .in('status', ['connected', 'open']);
    
    if (data) {
      setInstances(data);
    }
  };

  // Cleanup disconnected instances from flows automatically
  useEffect(() => {
    const cleanupDisconnectedInstances = async () => {
      if (!flows.length || loading) return;
      
      const connectedInstanceIds = new Set(instances.map(i => i.id));
      
      for (const flow of flows) {
        if (flow.assigned_instances && flow.assigned_instances.length > 0) {
          const validInstances = flow.assigned_instances.filter(
            (id) => connectedInstanceIds.has(id)
          );
          
          // If some instances were removed, update the flow
          if (validInstances.length !== flow.assigned_instances.length) {
            console.log(`Cleaning up disconnected instances from flow ${flow.name}`);
            await updateFlow(flow.id, { assigned_instances: validInstances });
          }
        }
      }
    };
    
    cleanupDisconnectedInstances();
  }, [flows, instances, loading, updateFlow]);

  const filteredFlows = flows.filter(flow => 
    flow.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateFlow = async () => {
    if (!newFlowName.trim()) {
      toast.error('Digite um nome para o fluxo');
      return;
    }

    const result = await createFlow(newFlowName, newFlowDescription);
    if (result.error) {
      toast.error('Erro ao criar fluxo: ' + result.error);
    } else {
      toast.success('Fluxo criado com sucesso');
      setShowCreateDialog(false);
      setNewFlowName('');
      setNewFlowDescription('');
      navigate(`/inbox/flows/${result.data?.id}`);
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!confirm('Tem certeza que deseja excluir este fluxo?')) return;
    
    const result = await deleteFlow(flowId);
    if (result.error) {
      toast.error('Erro ao excluir fluxo: ' + result.error);
    } else {
      toast.success('Fluxo excluído com sucesso');
    }
  };

  const handleToggleActive = async (flowId: string, isActive: boolean) => {
    const result = await toggleFlowActive(flowId, isActive);
    if (result.error) {
      toast.error('Erro ao atualizar fluxo: ' + result.error);
    }
  };

  const handleDuplicateFlow = async (flow: typeof flows[0]) => {
    const result = await createFlow(`${flow.name} (Cópia)`, flow.description || '');
    if (result.error) {
      toast.error('Erro ao duplicar fluxo: ' + result.error);
    } else if (result.data) {
      // Update the duplicated flow with nodes, edges, and settings
      const updateResult = await updateFlow(result.data.id, {
        nodes: flow.nodes,
        edges: flow.edges,
        trigger_type: flow.trigger_type,
        trigger_keywords: flow.trigger_keywords,
        assigned_instances: flow.assigned_instances,
        is_active: false, // Start as inactive
      });
      if (updateResult.error) {
        toast.error('Erro ao configurar fluxo duplicado: ' + updateResult.error);
      } else {
        toast.success('Fluxo duplicado com sucesso');
      }
    }
  };

  const openInstancesDialog = (flowId: string) => {
    const flow = flows.find(f => f.id === flowId);
    setSelectedFlowId(flowId);
    setSelectedInstances(flow?.assigned_instances || []);
    setShowInstancesDialog(true);
  };

  const handleSaveInstances = async () => {
    if (!selectedFlowId) return;
    
    const result = await updateFlow(selectedFlowId, { assigned_instances: selectedInstances });
    if (result.error) {
      toast.error('Erro ao atualizar números: ' + result.error);
    } else {
      toast.success('Números atualizados com sucesso');
      setShowInstancesDialog(false);
    }
  };

  const toggleInstance = (instanceId: string) => {
    setSelectedInstances(prev => 
      prev.includes(instanceId) 
        ? prev.filter(id => id !== instanceId)
        : [...prev, instanceId]
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Instances Selection Dialog */}
      <Dialog open={showInstancesDialog} onOpenChange={setShowInstancesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecionar Números</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Selecione em quais números este fluxo deve funcionar. Se nenhum for selecionado, funcionará em todos.
            </p>
            {instances.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum número conectado encontrado.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {instances.map(instance => (
                  <div key={instance.id} className="flex items-center space-x-3 p-2 rounded hover:bg-muted">
                    <Checkbox
                      id={instance.id}
                      checked={selectedInstances.includes(instance.id)}
                      onCheckedChange={() => toggleInstance(instance.id)}
                    />
                    <label htmlFor={instance.id} className="flex-1 cursor-pointer">
                      <p className="font-medium text-sm">{instance.label || instance.instance_name}</p>
                      <p className="text-xs text-muted-foreground">{instance.phone_number || 'Sem número'}</p>
                    </label>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowInstancesDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveInstances}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Header />
      <div className="h-14 md:h-16" /> {/* Spacer for fixed header */}
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/inbox')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Fluxos de Automação</h1>
            <p className="text-muted-foreground">Crie e gerencie seus fluxos de conversa automatizados</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar fluxos..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Fluxo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Fluxo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Nome do Fluxo</Label>
                  <Input
                    placeholder="Ex: Atendimento Inicial"
                    value={newFlowName}
                    onChange={(e) => setNewFlowName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição (opcional)</Label>
                  <Textarea
                    placeholder="Descreva o objetivo deste fluxo..."
                    value={newFlowDescription}
                    onChange={(e) => setNewFlowDescription(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateFlow}>
                    Criar Fluxo
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4"></div>
                  <div className="h-4 bg-muted rounded w-1/2 mt-2"></div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : filteredFlows.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum fluxo encontrado</h3>
              <p className="text-muted-foreground mb-4">Crie seu primeiro fluxo de automação</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Fluxo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFlows.map(flow => (
              <Card key={flow.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{flow.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {flow.description || 'Sem descrição'}
                      </CardDescription>
                    </div>
                    <Switch
                      checked={flow.is_active}
                      onCheckedChange={(checked) => handleToggleActive(flow.id, checked)}
                      className={flow.is_active 
                        ? "data-[state=checked]:bg-green-500" 
                        : "data-[state=unchecked]:bg-red-500"
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <Badge 
                      className={flow.is_active 
                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                        : 'bg-red-500 hover:bg-red-600 text-white'
                      }
                    >
                      {flow.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge variant="outline">
                      {flow.trigger_type === 'keyword' ? 'Palavra-chave' : 
                       flow.trigger_type === 'all' ? 'Todas mensagens' : 'Agendado'}
                    </Badge>
                  </div>

                  {/* Show keywords */}
                  {flow.trigger_type === 'keyword' && flow.trigger_keywords && flow.trigger_keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {flow.trigger_keywords.slice(0, 5).map((keyword, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                      {flow.trigger_keywords.length > 5 && (
                        <Badge variant="secondary" className="text-xs">
                          +{flow.trigger_keywords.length - 5}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Show assigned instances */}
                  <div className="flex flex-wrap items-center gap-1 mb-4">
                    {flow.assigned_instances && flow.assigned_instances.length > 0 ? (
                      <>
                        <Smartphone className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {flow.assigned_instances.length} número(s)
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Todos os números</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => navigate(`/inbox/flows/${flow.id}`)}
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => openInstancesDialog(flow.id)}
                      title="Selecionar números"
                    >
                      <Smartphone className="h-3 w-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => handleDuplicateFlow(flow)}
                      title="Duplicar fluxo"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteFlow(flow.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FlowListPage;
