import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Zap, Edit2, Trash2, Copy, ArrowLeft, Smartphone, AlertTriangle, Settings, Folder, FolderOpen, ChevronRight, GripVertical, Download, Upload } from 'lucide-react';
import { useInboxFlows } from '@/hooks/useInboxFlows';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { AnimatedSearchBar } from '@/components/ui/animated-search-bar';
import { FlowSettingsDialog } from '@/components/flow-builder/FlowSettingsDialog';
import { InboxFlow } from '@/types/inbox';
import { cn } from '@/lib/utils';

interface FlowFolder {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

const FlowListPage = () => {
  const location = useLocation();
  const isAutomatiZap = location.pathname.startsWith('/inbox');
  const systemName = isAutomatiZap ? "Automati-Zap Fluxos" : "DisparaZap Fluxos";
  useActivityTracker("page_visit", systemName);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const { flows, loading, createFlow, deleteFlow, toggleFlowActive, updateFlow, refetch } = useInboxFlows();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [instances, setInstances] = useState<Array<{ id: string; instance_name: string; phone_number: string | null; label: string | null }>>([]);
  const [showInstancesDialog, setShowInstancesDialog] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsFlow, setSettingsFlow] = useState<InboxFlow | null>(null);

  // Folder states
  const [folders, setFolders] = useState<FlowFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<string | null>(null);
  const [editFolderDialog, setEditFolderDialog] = useState<FlowFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  // Drag and drop states
  const [draggingFlowId, setDraggingFlowId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Export/Import states
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportCode, setExportCode] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchInstances();
      fetchFolders();
    }
  }, [user]);

  const fetchInstances = async () => {
    const userId = effectiveUserId || user?.id;
    const { data } = await supabase
      .from('maturador_instances')
      .select('id, instance_name, phone_number, label')
      .eq('user_id', userId)
      .in('status', ['connected', 'open']);
    
    if (data) {
      setInstances(data);
    }
  };

  const fetchFolders = async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;
    
    const { data, error } = await supabase
      .from('inbox_flow_folders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    
    if (data) {
      setFolders(data);
    }
  };

  // Cleanup disconnected instances from flows automatically
  useEffect(() => {
    const cleanupDisconnectedInstances = async () => {
      if (!flows.length || loading || instances.length === 0) return;
      
      const connectedInstanceIds = new Set(instances.map(i => i.id));
      
      for (const flow of flows) {
        if (flow.assigned_instances && flow.assigned_instances.length > 0) {
          const validInstances = flow.assigned_instances.filter(
            (id) => connectedInstanceIds.has(id)
          );
          
          if (validInstances.length !== flow.assigned_instances.length) {
            console.log(`Cleaning up disconnected instances from flow ${flow.name}: ${flow.assigned_instances.length} -> ${validInstances.length}`);
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

  // Separate flows by folder
  const flowsInFolder = (folderId: string) => 
    filteredFlows.filter(f => (f as any).folder_id === folderId);
  
  const flowsWithoutFolder = filteredFlows.filter(f => !(f as any).folder_id);

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

  const openDeleteDialog = (flowId: string) => {
    setFlowToDelete(flowId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteFlow = async () => {
    if (!flowToDelete) return;
    
    const result = await deleteFlow(flowToDelete);
    if (result.error) {
      toast.error('Erro ao excluir fluxo: ' + result.error);
    } else {
      toast.success('Fluxo excluído com sucesso');
    }
    setDeleteDialogOpen(false);
    setFlowToDelete(null);
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
      const updateResult = await updateFlow(result.data.id, {
        nodes: flow.nodes,
        edges: flow.edges,
        trigger_type: flow.trigger_type,
        trigger_keywords: flow.trigger_keywords,
        assigned_instances: flow.assigned_instances,
        is_active: false,
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

  const openSettingsDialog = (flow: InboxFlow) => {
    setSettingsFlow(flow);
    setShowSettingsDialog(true);
  };

  const handleSaveSettings = async (flowId: string, updates: Partial<InboxFlow>) => {
    const result = await updateFlow(flowId, updates);
    if (!result.error) {
      refetch();
    }
    return result;
  };

  // Folder handlers
  const handleCreateFolder = async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId || !newFolderName.trim()) {
      toast.error('Digite um nome para a pasta');
      return;
    }

    const { error } = await supabase
      .from('inbox_flow_folders')
      .insert({ user_id: userId, name: newFolderName.trim() });

    if (error) {
      toast.error('Erro ao criar pasta');
    } else {
      toast.success('Pasta criada!');
      setShowCreateFolderDialog(false);
      setNewFolderName('');
      fetchFolders();
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderDialog) return;

    // First, move all flows out of this folder
    const { error: updateError } = await supabase
      .from('inbox_flows')
      .update({ folder_id: null })
      .eq('folder_id', deleteFolderDialog);

    if (updateError) {
      toast.error('Erro ao mover fluxos');
      return;
    }

    const { error } = await supabase
      .from('inbox_flow_folders')
      .delete()
      .eq('id', deleteFolderDialog);

    if (error) {
      toast.error('Erro ao excluir pasta');
    } else {
      toast.success('Pasta excluída!');
      setDeleteFolderDialog(null);
      fetchFolders();
      refetch();
    }
  };

  const handleEditFolder = async () => {
    if (!editFolderDialog || !editFolderName.trim()) return;

    const { error } = await supabase
      .from('inbox_flow_folders')
      .update({ name: editFolderName.trim() })
      .eq('id', editFolderDialog.id);

    if (error) {
      toast.error('Erro ao renomear pasta');
    } else {
      toast.success('Pasta renomeada!');
      setEditFolderDialog(null);
      setEditFolderName('');
      fetchFolders();
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, flowId: string) => {
    e.dataTransfer.setData('flowId', flowId);
    setDraggingFlowId(flowId);
  };

  const handleDragEnd = () => {
    setDraggingFlowId(null);
    setDragOverFolderId(null);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleDrop = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    const flowId = e.dataTransfer.getData('flowId');
    
    if (!flowId) return;

    const { error } = await supabase
      .from('inbox_flows')
      .update({ folder_id: folderId })
      .eq('id', flowId);

    if (error) {
      toast.error('Erro ao mover fluxo');
    } else {
      toast.success(folderId ? 'Fluxo movido para pasta!' : 'Fluxo removido da pasta!');
      refetch();
    }

    setDraggingFlowId(null);
    setDragOverFolderId(null);
  };

  // Export flow handler
  const handleExportFlow = (flow: typeof flows[0]) => {
    setExportCode(flow.id);
    setShowExportDialog(true);
  };

  // Import flow handler
  const handleImportFlow = async () => {
    if (!importCode.trim()) {
      toast.error('Cole o código do fluxo');
      return;
    }

    const userId = effectiveUserId || user?.id;
    if (!userId) {
      toast.error('Usuário não autenticado');
      return;
    }

    setIsImporting(true);

    try {
      // Fetch the original flow by ID
      const { data: originalFlow, error: fetchError } = await supabase
        .from('inbox_flows')
        .select('*')
        .eq('id', importCode.trim())
        .maybeSingle();

      if (fetchError || !originalFlow) {
        toast.error('Fluxo não encontrado. Verifique o código.');
        setIsImporting(false);
        return;
      }

      // Create a copy of the flow for the current user
      const { data: newFlow, error: insertError } = await supabase
        .from('inbox_flows')
        .insert({
          user_id: userId,
          name: `${originalFlow.name} (Importado)`,
          description: originalFlow.description,
          nodes: originalFlow.nodes,
          edges: originalFlow.edges,
          trigger_type: originalFlow.trigger_type,
          trigger_keywords: originalFlow.trigger_keywords,
          assigned_instances: [], // Don't copy instances
          is_active: false, // Start as inactive
          priority: originalFlow.priority,
          pause_on_media: originalFlow.pause_on_media,
          pause_schedule_enabled: originalFlow.pause_schedule_enabled,
          pause_schedule_start: originalFlow.pause_schedule_start,
          pause_schedule_end: originalFlow.pause_schedule_end,
          reply_to_last_message: originalFlow.reply_to_last_message,
          reply_mode: originalFlow.reply_mode,
          reply_interval: originalFlow.reply_interval,
          pause_other_flows: originalFlow.pause_other_flows,
          knowledge_base: (originalFlow as any).knowledge_base,
        })
        .select()
        .single();

      if (insertError) {
        toast.error('Erro ao importar fluxo: ' + insertError.message);
        setIsImporting(false);
        return;
      }

      toast.success('Fluxo importado com sucesso!');
      setShowImportDialog(false);
      setImportCode('');
      refetch();

      // Navigate to the new flow
      if (newFlow) {
        navigate(`/inbox/flows/${newFlow.id}`);
      }
    } catch (err: any) {
      toast.error('Erro ao importar fluxo: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const copyExportCode = () => {
    navigator.clipboard.writeText(exportCode);
    toast.success('Código copiado!');
  };

  const renderFlowCard = (flow: typeof flows[0], inFolder: boolean = false) => (
    <Card 
      key={flow.id} 
      className={cn(
        "hover:shadow-md transition-all cursor-grab active:cursor-grabbing",
        draggingFlowId === flow.id && "opacity-50 scale-95 ring-2 ring-orange-500"
      )}
      draggable
      onDragStart={(e) => handleDragStart(e, flow.id)}
      onDragEnd={handleDragEnd}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1">
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{flow.name}</CardTitle>
              <CardDescription className="mt-1 line-clamp-2">
                {flow.description || 'Sem descrição'}
              </CardDescription>
            </div>
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

        {flow.trigger_type === 'keyword' && (
          <div className="flex flex-wrap gap-1 mb-4">
            {flow.trigger_keywords && flow.trigger_keywords.length > 0 ? (
              <>
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
              </>
            ) : (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Sem palavras-chave
              </Badge>
            )}
          </div>
        )}

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
            onClick={() => openSettingsDialog(flow)}
            title="Configurações do fluxo"
          >
            <Settings className="h-3 w-3" />
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
            className="h-8 w-8"
            onClick={() => handleExportFlow(flow)}
            title="Exportar fluxo"
          >
            <Download className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => openDeleteDialog(flow.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

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
      <div className="h-14 md:h-16" />
      
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
          <div className="flex-1 max-w-md">
            <AnimatedSearchBar
              placeholder="Buscar fluxos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Import Flow Button */}
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Importar
            </Button>

            {/* Create Folder Button */}
            <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Folder className="h-4 w-4 mr-2" />
                  Nova Pasta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Nova Pasta</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Nome da Pasta</Label>
                    <Input
                      placeholder="Ex: Vendas"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowCreateFolderDialog(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreateFolder}>
                      Criar Pasta
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Create Flow Button */}
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
        ) : filteredFlows.length === 0 && folders.length === 0 ? (
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
          <div className="space-y-6">
            {/* Folders */}
            {folders.map(folder => {
              const folderFlows = flowsInFolder(folder.id);
              const isExpanded = expandedFolders.has(folder.id);
              const isDragOver = dragOverFolderId === folder.id;

              return (
                <div key={folder.id} className="space-y-3">
                  <div
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border-2 transition-all",
                      isDragOver 
                        ? "border-orange-500 bg-orange-500/10 scale-[1.02]" 
                        : "border-orange-500/50 bg-orange-500/5",
                      draggingFlowId && "ring-2 ring-orange-500/30"
                    )}
                    onDragOver={(e) => handleDragOver(e, folder.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, folder.id)}
                  >
                    <button
                      className="flex items-center gap-3 flex-1 text-left"
                      onClick={() => toggleFolder(folder.id)}
                    >
                      <ChevronRight 
                        className={cn(
                          "h-5 w-5 text-orange-500 transition-transform",
                          isExpanded && "rotate-90"
                        )} 
                      />
                      {isExpanded ? (
                        <FolderOpen className="h-5 w-5 text-orange-500" />
                      ) : (
                        <Folder className="h-5 w-5 text-orange-500" />
                      )}
                      <span className="font-semibold text-orange-500">{folder.name}</span>
                      <Badge variant="secondary" className="ml-2">
                        {folderFlows.length} fluxo(s)
                      </Badge>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditFolderDialog(folder);
                          setEditFolderName(folder.name);
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteFolderDialog(folder.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-6 border-l-2 border-orange-500/30 ml-3">
                      {folderFlows.length === 0 ? (
                        <div className="col-span-full py-8 text-center text-muted-foreground">
                          <p>Arraste fluxos para esta pasta</p>
                        </div>
                      ) : (
                        folderFlows.map(flow => renderFlowCard(flow, true))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Flows without folder */}
            {flowsWithoutFolder.length > 0 && (
              <div
                className={cn(
                  "space-y-4",
                  dragOverFolderId === 'none' && "ring-2 ring-orange-500/50 rounded-lg p-4"
                )}
                onDragOver={(e) => handleDragOver(e, 'none')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, null)}
              >
                {folders.length > 0 && (
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Sem Pasta
                  </h3>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {flowsWithoutFolder.map(flow => renderFlowCard(flow))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Flow Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este fluxo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFlowToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFlow} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog open={!!deleteFolderDialog} onOpenChange={() => setDeleteFolderDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pasta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta pasta? Os fluxos dentro dela serão movidos para fora da pasta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Folder Dialog */}
      <Dialog open={!!editFolderDialog} onOpenChange={() => setEditFolderDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear Pasta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nome da Pasta</Label>
              <Input
                value={editFolderName}
                onChange={(e) => setEditFolderName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditFolderDialog(null)}>
                Cancelar
              </Button>
              <Button onClick={handleEditFolder}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Flow Settings Dialog */}
      <FlowSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        flow={settingsFlow}
        instances={instances}
        onSave={handleSaveSettings}
      />

      {/* Export Flow Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar Fluxo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Use o código abaixo para compartilhar ou importar este fluxo em outra conta.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={exportCode}
                className="font-mono text-sm"
              />
              <Button onClick={copyExportCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowExportDialog(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Flow Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Fluxo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Cole o código do fluxo que deseja importar. O fluxo será copiado para sua conta como inativo.
            </p>
            <div className="space-y-2">
              <Label>Código do Fluxo</Label>
              <Input
                placeholder="Cole o código UUID aqui..."
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowImportDialog(false);
                setImportCode('');
              }}>
                Cancelar
              </Button>
              <Button onClick={handleImportFlow} disabled={isImporting || !importCode.trim()}>
                {isImporting ? 'Importando...' : 'Importar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FlowListPage;
