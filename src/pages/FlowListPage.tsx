import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Search, Zap, Edit2, Trash2, Copy, ArrowLeft } from 'lucide-react';
import { useInboxFlows } from '@/hooks/useInboxFlows';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const FlowListPage = () => {
  const navigate = useNavigate();
  const { flows, loading, createFlow, deleteFlow, toggleFlowActive } = useInboxFlows();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');

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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
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
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant={flow.is_active ? 'default' : 'secondary'}>
                      {flow.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge variant="outline">
                      {flow.trigger_type === 'keyword' ? 'Palavra-chave' : 
                       flow.trigger_type === 'all' ? 'Todas mensagens' : 'Agendado'}
                    </Badge>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8">
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
