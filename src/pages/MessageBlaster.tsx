import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  Plus, 
  SendHorizonal, 
  Trash2, 
  Play, 
  Pause, 
  Upload, 
  Smartphone,
  Clock,
  MessageSquare,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Image as ImageIcon,
  Video,
  FileText,
  Music,
  GitBranch,
  Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { isDisconnectionError, checkAndNotifyDisconnection } from '@/hooks/useInstanceStatusSync';
import { toast } from 'sonner';

interface Campaign {
  id: string;
  name: string;
  message_variations: string[];
  phone_numbers: string[];
  delay_min: number;
  delay_max: number;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  sent_count: number;
  failed_count: number;
  total_count: number;
  current_index: number;
  assigned_instances: string[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
  media_type?: string;
  media_url?: string;
  dispatches_per_instance?: number;
  flow_id?: string;
}

interface InboxFlow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
}

const MessageBlaster = () => {
  useActivityTracker("page_visit", "DisparaZap");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInstancesDialog, setShowInstancesDialog] = useState(false);
  const [availableFlows, setAvailableFlows] = useState<InboxFlow[]>([]);
  
  // Form state
  const [campaignName, setCampaignName] = useState('');
  const [messageVariations, setMessageVariations] = useState<string[]>(['']);
  const [phoneNumbers, setPhoneNumbers] = useState('');
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(15);
  const [useFixedDelay, setUseFixedDelay] = useState(false);
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [importMethod, setImportMethod] = useState<'manual' | 'file'>('manual');
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video' | 'audio' | 'document'>('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [dispatchesPerInstance, setDispatchesPerInstance] = useState(1);
  const [useFlow, setUseFlow] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const fetchCampaigns = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('blaster_campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching campaigns:', error);
      toast.error('Erro ao carregar campanhas');
    } else {
      setCampaigns((data || []).map(c => ({
        ...c,
        message_variations: c.message_variations as string[],
        phone_numbers: c.phone_numbers as string[],
        assigned_instances: c.assigned_instances || [],
      })) as Campaign[]);
    }
    setLoading(false);
  }, [user]);

  const fetchInstances = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('maturador_instances')
      .select('id, instance_name, phone_number, label, status')
      .eq('user_id', user.id)
      .in('status', ['connected', 'open']);
    
    if (data) {
      setInstances(data);
    }
  }, [user]);

  const fetchFlows = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('inbox_flows')
      .select('id, name, description, is_active')
      .eq('user_id', user.id)
      .order('name');
    
    if (data) {
      setAvailableFlows(data);
    }
  }, [user]);

  useEffect(() => {
    fetchCampaigns();
    fetchInstances();
    fetchFlows();
  }, [fetchCampaigns, fetchInstances, fetchFlows]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('blaster-campaigns-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blaster_campaigns',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchCampaigns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchCampaigns]);

  const addMessageVariation = () => {
    if (messageVariations.length < 5) {
      setMessageVariations([...messageVariations, '']);
    }
  };

  const removeMessageVariation = (index: number) => {
    if (messageVariations.length > 1) {
      setMessageVariations(messageVariations.filter((_, i) => i !== index));
    }
  };

  const updateMessageVariation = (index: number, value: string) => {
    const updated = [...messageVariations];
    updated[index] = value;
    setMessageVariations(updated);
  };

  const parsePhoneNumbers = (text: string): string[] => {
    const numbers = text
      .split(/[\n,;]+/)
      .map(n => n.trim().replace(/\D/g, ''))
      .filter(n => n.length >= 10 && n.length <= 15);
    
    return [...new Set(numbers)];
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPhoneNumbers(content);
      toast.success(`Arquivo carregado: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const handleCreateCampaign = async () => {
    if (!user) return;
    
    if (!campaignName.trim()) {
      toast.error('Digite um nome para a campanha');
      return;
    }

    // Validations - flow requires either flow or messages
    const validMessages = messageVariations.filter(m => m.trim());
    if (!useFlow && validMessages.length === 0 && mediaType === 'text') {
      toast.error('Adicione pelo menos uma variação de mensagem');
      return;
    }

    if (useFlow && !selectedFlowId) {
      toast.error('Selecione um fluxo para enviar');
      return;
    }

    if (!useFlow && mediaType !== 'text' && !mediaUrl.trim()) {
      toast.error('Adicione a URL da mídia');
      return;
    }

    const numbers = parsePhoneNumbers(phoneNumbers);
    if (numbers.length === 0) {
      toast.error('Adicione pelo menos um número válido');
      return;
    }

    if (selectedInstances.length === 0) {
      toast.error('Selecione pelo menos um número para enviar');
      return;
    }

    const finalDelayMin = useFixedDelay ? delayMin : delayMin;
    const finalDelayMax = useFixedDelay ? delayMin : delayMax;

    const { error } = await supabase
      .from('blaster_campaigns')
      .insert({
        user_id: user.id,
        name: campaignName,
        message_variations: useFlow ? [] : validMessages,
        phone_numbers: numbers,
        delay_min: finalDelayMin,
        delay_max: finalDelayMax,
        total_count: numbers.length,
        assigned_instances: selectedInstances,
        status: 'draft',
        media_type: useFlow ? 'flow' : mediaType,
        media_url: !useFlow && mediaType !== 'text' ? mediaUrl : null,
        dispatches_per_instance: dispatchesPerInstance,
        flow_id: useFlow ? selectedFlowId : null,
      });

    if (error) {
      toast.error('Erro ao criar campanha: ' + error.message);
    } else {
      toast.success('Campanha criada com sucesso!');
      setShowCreateDialog(false);
      resetForm();
      fetchCampaigns();
    }
  };

  const resetForm = () => {
    setCampaignName('');
    setMessageVariations(['']);
    setPhoneNumbers('');
    setDelayMin(5);
    setDelayMax(15);
    setUseFixedDelay(false);
    setSelectedInstances([]);
    setMediaType('text');
    setMediaUrl('');
    setDispatchesPerInstance(1);
    setUseFlow(false);
    setSelectedFlowId('');
  };

  const startCampaign = async (campaignId: string) => {
    try {
      // Get campaign to check assigned instances
      const campaign = campaigns.find(c => c.id === campaignId);
      
      const response = await supabase.functions.invoke('blaster-send', {
        body: { campaignId, action: 'start' },
      });

      if (response.error) {
        const errorMessage = response.error.message || String(response.error);
        
        // Check if error indicates disconnection
        if (isDisconnectionError(errorMessage) && campaign?.assigned_instances?.length) {
          // Check each assigned instance
          for (const instanceId of campaign.assigned_instances) {
            const wasDisconnected = await checkAndNotifyDisconnection(instanceId, 'disparazap');
            if (wasDisconnected) return;
          }
        }
        
        throw new Error(errorMessage);
      }

      if (response.data?.error) {
        const errorMessage = response.data.error;
        
        // Check if error indicates disconnection
        if (isDisconnectionError(errorMessage) && campaign?.assigned_instances?.length) {
          for (const instanceId of campaign.assigned_instances) {
            const wasDisconnected = await checkAndNotifyDisconnection(instanceId, 'disparazap');
            if (wasDisconnected) return;
          }
        }
        
        throw new Error(errorMessage);
      }

      toast.success('Campanha iniciada!');
    } catch (error: any) {
      toast.error('Erro ao iniciar campanha: ' + error.message);
    }
  };

  const pauseCampaign = async (campaignId: string) => {
    const { error } = await supabase
      .from('blaster_campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId);

    if (error) {
      toast.error('Erro ao pausar campanha');
    } else {
      toast.success('Campanha pausada');
      fetchCampaigns();
    }
  };

  const cancelCampaign = async (campaignId: string) => {
    const { error } = await supabase
      .from('blaster_campaigns')
      .update({ status: 'cancelled' })
      .eq('id', campaignId);

    if (error) {
      toast.error('Erro ao cancelar campanha');
    } else {
      toast.success('Campanha cancelada');
      fetchCampaigns();
    }
  };

  const confirmDeleteCampaign = async () => {
    if (!campaignToDelete) return;

    const { error } = await supabase
      .from('blaster_campaigns')
      .delete()
      .eq('id', campaignToDelete);

    if (error) {
      toast.error('Erro ao excluir campanha');
    } else {
      toast.success('Campanha excluída');
      fetchCampaigns();
    }
    setCampaignToDelete(null);
  };

  const confirmDeleteFlow = async () => {
    if (!flowToDelete) return;

    const { error } = await supabase
      .from('inbox_flows')
      .delete()
      .eq('id', flowToDelete);

    if (error) {
      toast.error('Erro ao excluir fluxo');
    } else {
      toast.success('Fluxo excluído');
      fetchFlows();
    }
    setFlowToDelete(null);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      draft: { label: 'Rascunho', className: 'bg-gray-500' },
      running: { label: 'Enviando', className: 'bg-green-500 animate-pulse' },
      paused: { label: 'Pausado', className: 'bg-yellow-500' },
      completed: { label: 'Concluído', className: 'bg-blue-500' },
      cancelled: { label: 'Cancelado', className: 'bg-red-500' },
    };

    const config = statusConfig[status] || statusConfig.draft;
    return <Badge className={`${config.className} text-white`}>{config.label}</Badge>;
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="h-3 w-3" />;
      case 'video': return <Video className="h-3 w-3" />;
      case 'audio': return <Music className="h-3 w-3" />;
      case 'document': return <FileText className="h-3 w-3" />;
      case 'flow': return <GitBranch className="h-3 w-3" />;
      default: return <MessageSquare className="h-3 w-3" />;
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
      <Header />
      <div className="h-14 md:h-16" />

      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <SendHorizonal className="h-6 w-6 text-primary" />
              DisparaZap
            </h1>
            <p className="text-muted-foreground">Envie mensagens em massa com variações e delays</p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Criar Nova Campanha</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Campaign Name */}
                <div className="space-y-2">
                  <Label>Nome da Campanha</Label>
                  <Input
                    placeholder="Ex: Black Friday 2024"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                  />
                </div>

                {/* Use Flow Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <GitBranch className="h-5 w-5 text-primary" />
                    <div>
                      <Label htmlFor="use-flow" className="cursor-pointer">Usar Fluxo de Mensagens</Label>
                      <p className="text-xs text-muted-foreground">
                        Envie todas as mensagens de um fluxo criado
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="use-flow"
                    checked={useFlow}
                    onCheckedChange={(checked) => {
                      setUseFlow(checked);
                      if (checked) {
                        setMediaType('text');
                        setMediaUrl('');
                      }
                    }}
                    className={useFlow ? 'data-[state=checked]:bg-green-500' : 'data-[state=unchecked]:bg-red-500'}
                  />
                </div>

                {/* Flow Selection */}
                {useFlow ? (
                  <div className="space-y-2">
                    <Label>Selecionar Fluxo</Label>
                    {availableFlows.length === 0 ? (
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-muted-foreground mb-2">Nenhum fluxo encontrado</p>
                        <Button variant="outline" size="sm" onClick={() => navigate('/disparazap/fluxos/novo')}>
                          <Plus className="h-4 w-4 mr-1" />
                          Criar Fluxo
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um fluxo..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFlows.map(flow => (
                              <SelectItem key={flow.id} value={flow.id}>
                                <div className="flex items-center gap-2">
                                  <GitBranch className="h-4 w-4" />
                                  {flow.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          O fluxo será executado para cada contato da lista
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Media Type */}
                    <div className="space-y-2">
                      <Label>Tipo de Conteúdo</Label>
                      <Select value={mediaType} onValueChange={(v) => setMediaType(v as any)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              Texto
                            </div>
                          </SelectItem>
                          <SelectItem value="image">
                            <div className="flex items-center gap-2">
                              <ImageIcon className="h-4 w-4" />
                              Imagem
                            </div>
                          </SelectItem>
                          <SelectItem value="video">
                            <div className="flex items-center gap-2">
                              <Video className="h-4 w-4" />
                              Vídeo
                            </div>
                          </SelectItem>
                          <SelectItem value="audio">
                            <div className="flex items-center gap-2">
                              <Music className="h-4 w-4" />
                              Áudio
                            </div>
                          </SelectItem>
                          <SelectItem value="document">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Documento
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Media URL */}
                    {mediaType !== 'text' && (
                      <div className="space-y-2">
                        <Label>URL da Mídia</Label>
                        <Input
                          placeholder="https://exemplo.com/arquivo.jpg"
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Cole a URL direta do arquivo ({mediaType})
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Message Variations - Only show if not using flow */}
                {!useFlow && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>
                        {mediaType !== 'text' ? 'Legenda (opcional)' : 'Variações de Mensagem'} ({messageVariations.length}/5)
                      </Label>
                      {messageVariations.length < 5 && (
                        <Button variant="outline" size="sm" onClick={addMessageVariation}>
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Use {'{nome}'} para inserir o nome do contato
                    </p>
                    {messageVariations.map((msg, index) => (
                      <div key={index} className="flex gap-2">
                        <Textarea
                          placeholder={mediaType !== 'text' ? `Legenda ${index + 1}...` : `Mensagem ${index + 1}...`}
                          value={msg}
                          onChange={(e) => updateMessageVariation(index, e.target.value)}
                          rows={2}
                          className="flex-1"
                        />
                        {messageVariations.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMessageVariation(index)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Phone Numbers */}
                <div className="space-y-2">
                  <Label>Números de Telefone</Label>
                  <Tabs value={importMethod} onValueChange={(v) => setImportMethod(v as 'manual' | 'file')}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="manual">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Manual
                      </TabsTrigger>
                      <TabsTrigger value="file">
                        <Upload className="h-4 w-4 mr-2" />
                        Arquivo
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="manual" className="mt-2">
                      <Textarea
                        placeholder="Cole os números aqui (um por linha ou separados por vírgula)&#10;Ex: 5511999999999&#10;5521888888888"
                        value={phoneNumbers}
                        onChange={(e) => setPhoneNumbers(e.target.value)}
                        rows={5}
                      />
                    </TabsContent>
                    <TabsContent value="file" className="mt-2">
                      <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                        <Input
                          type="file"
                          accept=".txt,.csv"
                          onChange={handleFileUpload}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Aceita arquivos .txt ou .csv com um número por linha
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>
                  <p className="text-xs text-muted-foreground">
                    {parsePhoneNumbers(phoneNumbers).length} números válidos encontrados
                  </p>
                </div>

                {/* Delay Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Delay entre mensagens</Label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="fixed-delay" className="text-sm font-normal">Delay fixo</Label>
                      <Switch
                        id="fixed-delay"
                        checked={useFixedDelay}
                        onCheckedChange={setUseFixedDelay}
                      />
                    </div>
                  </div>
                  
                  {useFixedDelay ? (
                    <div className="space-y-2">
                      <Label>Delay Fixo (segundos)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={delayMin}
                        onChange={(e) => setDelayMin(parseInt(e.target.value) || 5)}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Delay Mínimo (segundos)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={delayMin}
                          onChange={(e) => setDelayMin(parseInt(e.target.value) || 5)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Delay Máximo (segundos)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={delayMax}
                          onChange={(e) => setDelayMax(parseInt(e.target.value) || 15)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Dispatches per Instance */}
                <div className="space-y-2">
                  <Label>Disparos por Número antes de Alternar</Label>
                  <Select value={dispatchesPerInstance.toString()} onValueChange={(v) => setDispatchesPerInstance(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 disparo por número</SelectItem>
                      <SelectItem value="2">2 disparos por número</SelectItem>
                      <SelectItem value="3">3 disparos por número</SelectItem>
                      <SelectItem value="5">5 disparos por número</SelectItem>
                      <SelectItem value="10">10 disparos por número</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Quantidade de mensagens enviadas por cada número antes de alternar para o próximo
                  </p>
                </div>

                {/* Instance Selection */}
                <div className="space-y-2">
                  <Label>Números para Envio</Label>
                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                    {instances.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4 text-center">
                        Nenhum número conectado encontrado.
                      </p>
                    ) : (
                      instances.map(instance => (
                        <div key={instance.id} className="flex items-center space-x-3 p-2 rounded hover:bg-muted">
                          <Checkbox
                            id={`instance-${instance.id}`}
                            checked={selectedInstances.includes(instance.id)}
                            onCheckedChange={() => toggleInstance(instance.id)}
                          />
                          <label htmlFor={`instance-${instance.id}`} className="flex-1 cursor-pointer">
                            <p className="font-medium text-sm">{instance.label || instance.instance_name}</p>
                            <p className="text-xs text-muted-foreground">{instance.phone_number || 'Sem número'}</p>
                          </label>
                          <Badge variant="outline" className="text-green-500 border-green-500">
                            Conectado
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedInstances.length} número(s) selecionado(s)
                  </p>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateCampaign} className="bg-green-600 hover:bg-green-700">
                    Criar Campanha
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Connected Numbers Dialog */}
          <Dialog open={showInstancesDialog} onOpenChange={setShowInstancesDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Números Conectados</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {instances.length === 0 ? (
                  <div className="text-center py-8">
                    <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">Nenhum número conectado</p>
                    <Button onClick={() => { setShowInstancesDialog(false); navigate('/maturador/instances'); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Conectar Número
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {instances.map(instance => (
                        <div key={instance.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{instance.label || instance.instance_name}</p>
                            <p className="text-sm text-muted-foreground">{instance.phone_number || 'Sem número'}</p>
                          </div>
                          <Badge variant="outline" className="text-green-500 border-green-500">
                            Conectado
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <Button className="w-full" onClick={() => { setShowInstancesDialog(false); navigate('/maturador/instances'); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Gerenciar Números
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-black border-2 border-accent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Campanhas</p>
                  <p className="text-2xl font-bold">{campaigns.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-black border-2 border-accent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Enviadas</p>
                  <p className="text-2xl font-bold">
                    {campaigns.reduce((acc, c) => acc + c.sent_count, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-black border-2 border-accent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <XCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Falhas</p>
                  <p className="text-2xl font-bold">
                    {campaigns.reduce((acc, c) => acc + c.failed_count, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow bg-black border-2 border-accent"
            onClick={() => setShowInstancesDialog(true)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Smartphone className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Números Conectados</p>
                  <p className="text-2xl font-bold">{instances.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Flows Section */}
        <Card className="mb-6 bg-black border-2 border-accent">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-primary" />
                  Fluxos de Mensagem
                </CardTitle>
                <CardDescription>
                  Crie e gerencie fluxos para envio automático
                </CardDescription>
              </div>
              <Button onClick={() => navigate('/disparazap/fluxos/novo')} className="bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Criar Fluxo
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {availableFlows.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-lg">
                <GitBranch className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-3">Nenhum fluxo criado ainda</p>
                <Button variant="outline" onClick={() => navigate('/disparazap/fluxos/novo')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Fluxo
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableFlows.slice(0, 6).map(flow => (
                  <div 
                    key={flow.id} 
                    className="flex items-center justify-between p-3 border-2 border-accent rounded-lg bg-black/50 hover:bg-black/80 transition-colors"
                  >
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => navigate(`/disparazap/fluxos/${flow.id}`)}
                    >
                      <div className={`p-2 rounded-lg ${flow.is_active ? 'bg-green-500/10' : 'bg-muted'}`}>
                        <GitBranch className={`h-4 w-4 ${flow.is_active ? 'text-green-500' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{flow.name}</p>
                        <p className="text-xs text-muted-foreground">{flow.description || 'Sem descrição'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => navigate(`/disparazap/fluxos/${flow.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFlowToDelete(flow.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {availableFlows.length > 6 && (
              <div className="text-center mt-4">
                <Button variant="outline" onClick={() => navigate('/disparazap/fluxos')}>
                  Ver todos os {availableFlows.length} fluxos
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campaigns List */}
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
        ) : campaigns.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <SendHorizonal className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma campanha encontrada</h3>
              <p className="text-muted-foreground mb-4">Crie sua primeira campanha de disparo</p>
              <Button onClick={() => setShowCreateDialog(true)} className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map(campaign => (
              <Card key={campaign.id} className="hover:shadow-md transition-shadow bg-black border-2 border-accent">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{campaign.name}</CardTitle>
                      <CardDescription className="mt-1">
                        Criado em {new Date(campaign.created_at).toLocaleDateString('pt-BR')}
                      </CardDescription>
                    </div>
                    {getStatusBadge(campaign.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Progress */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-medium">
                        {campaign.sent_count + campaign.failed_count}/{campaign.total_count}
                      </span>
                    </div>
                    <Progress 
                      value={campaign.total_count > 0 
                        ? ((campaign.sent_count + campaign.failed_count) / campaign.total_count) * 100 
                        : 0
                      } 
                    />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <div className="p-2 bg-black/50 border border-accent/30 rounded">
                      <p className="text-lg font-bold text-green-500">{campaign.sent_count}</p>
                      <p className="text-xs text-muted-foreground">Enviadas</p>
                    </div>
                    <div className="p-2 bg-black/50 border border-accent/30 rounded">
                      <p className="text-lg font-bold text-red-500">{campaign.failed_count}</p>
                      <p className="text-xs text-muted-foreground">Falhas</p>
                    </div>
                    <div className="p-2 bg-black/50 border border-accent/30 rounded">
                      <p className="text-lg font-bold">{campaign.total_count}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge variant="outline">
                      {getMediaIcon(campaign.media_type || 'text')}
                      <span className="ml-1">{campaign.media_type || 'texto'}</span>
                    </Badge>
                    <Badge variant="outline">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {campaign.message_variations.length} variação(ões)
                    </Badge>
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" />
                      {campaign.delay_min === campaign.delay_max 
                        ? `${campaign.delay_min}s` 
                        : `${campaign.delay_min}-${campaign.delay_max}s`
                      }
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {campaign.status === 'draft' && (
                      <Button 
                        size="sm" 
                        className="flex-1 bg-green-500 hover:bg-green-600"
                        onClick={() => startCampaign(campaign.id)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Iniciar
                      </Button>
                    )}
                    {campaign.status === 'running' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1"
                        onClick={() => pauseCampaign(campaign.id)}
                      >
                        <Pause className="h-3 w-3 mr-1" />
                        Pausar
                      </Button>
                    )}
                    {campaign.status === 'paused' && (
                      <>
                        <Button 
                          size="sm" 
                          className="flex-1 bg-green-500 hover:bg-green-600"
                          onClick={() => startCampaign(campaign.id)}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Continuar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => cancelCampaign(campaign.id)}
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    {(campaign.status === 'completed' || campaign.status === 'cancelled') && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1"
                        disabled
                      >
                        {campaign.status === 'completed' ? 'Concluído' : 'Cancelado'}
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setCampaignToDelete(campaign.id)}
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

      {/* Flow Delete Confirmation Dialog */}
      <AlertDialog open={!!flowToDelete} onOpenChange={(open) => !open && setFlowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Fluxo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este fluxo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFlow} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Campaign Delete Confirmation Dialog */}
      <AlertDialog open={!!campaignToDelete} onOpenChange={(open) => !open && setCampaignToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Campanha</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCampaign} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MessageBlaster;
