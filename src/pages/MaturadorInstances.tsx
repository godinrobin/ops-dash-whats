import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, RefreshCw, Loader2, Smartphone, QrCode, Trash2, Power, PowerOff, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  qrcode: string | null;
  last_seen: string | null;
  created_at: string;
}

export default function MaturadorInstances() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);

  // Create instance modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [creating, setCreating] = useState(false);

  // QR Code modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [currentQrInstance, setCurrentQrInstance] = useState<Instance | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<Instance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchInstances = async () => {
    if (!user) return;

    try {
      // Check config
      const { data: config } = await supabase
        .from('maturador_config')
        .select('id')
        .eq('user_id', user.id)
        .single();

      setHasConfig(!!config);

      // Fetch instances from database
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);

    } catch (error) {
      console.error('Error fetching instances:', error);
      toast.error('Erro ao carregar instâncias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    
    // Update status of all instances
    for (const instance of instances) {
      try {
        await supabase.functions.invoke('maturador-evolution', {
          body: { action: 'check-status', instanceName: instance.instance_name },
        });
      } catch (error) {
        console.error(`Error checking status for ${instance.instance_name}:`, error);
      }
    }
    
    await fetchInstances();
    setRefreshing(false);
    toast.success('Status atualizado');
  };

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      toast.error('Nome da instância é obrigatório');
      return;
    }

    // Validate instance name (only alphanumeric and underscores)
    if (!/^[a-zA-Z0-9_]+$/.test(newInstanceName)) {
      toast.error('O nome da instância deve conter apenas letras, números e underscores');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'create-instance', instanceName: newInstanceName },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Instância criada com sucesso!');
      setCreateModalOpen(false);
      setNewInstanceName("");
      
      // Refresh and open QR modal
      await fetchInstances();
      
      // Get the new instance and show QR
      const newInstance = {
        ...data,
        instance_name: newInstanceName,
        qrcode: data.qrcode?.base64,
      };
      
      if (newInstance.qrcode) {
        setCurrentQrInstance(newInstance);
        setQrCode(newInstance.qrcode);
        setQrModalOpen(true);
      }

    } catch (error: any) {
      console.error('Error creating instance:', error);
      toast.error(error.message || 'Erro ao criar instância');
    } finally {
      setCreating(false);
    }
  };

  const handleGetQrCode = async (instance: Instance) => {
    setCurrentQrInstance(instance);
    setQrModalOpen(true);
    setLoadingQr(true);
    setQrCode(null);

    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'get-qrcode', instanceName: instance.instance_name },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setQrCode(data.base64 || data.qrcode?.base64);
      
    } catch (error: any) {
      console.error('Error getting QR code:', error);
      toast.error(error.message || 'Erro ao obter QR Code');
      setQrModalOpen(false);
    } finally {
      setLoadingQr(false);
    }
  };

  const handleCheckQrStatus = async () => {
    if (!currentQrInstance) return;
    
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'check-status', instanceName: currentQrInstance.instance_name },
      });

      if (error) throw error;

      if (data.instance?.state === 'open') {
        toast.success('WhatsApp conectado com sucesso!');
        setQrModalOpen(false);
        await fetchInstances();
      } else {
        toast.info('Aguardando leitura do QR Code...');
      }
    } catch (error: any) {
      console.error('Error checking status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleLogout = async (instance: Instance) => {
    setActionLoading(instance.id);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'logout-instance', instanceName: instance.instance_name },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Instância desconectada');
      await fetchInstances();
    } catch (error: any) {
      console.error('Error logging out:', error);
      toast.error(error.message || 'Erro ao desconectar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async (instance: Instance) => {
    setActionLoading(instance.id);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'restart-instance', instanceName: instance.instance_name },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Instância reiniciada');
      await fetchInstances();
    } catch (error: any) {
      console.error('Error restarting:', error);
      toast.error(error.message || 'Erro ao reiniciar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!instanceToDelete) return;

    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'delete-instance', instanceName: instanceToDelete.instance_name },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Instância removida');
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
      await fetchInstances();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(error.message || 'Erro ao remover instância');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      default: return 'bg-red-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando';
      default: return 'Desconectado';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasConfig) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" onClick={() => navigate('/maturador')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Instâncias</h1>
          </div>
          
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Configuração Necessária</h3>
              <p className="text-muted-foreground mb-4">Configure sua Evolution API antes de adicionar instâncias.</p>
              <Button onClick={() => navigate('/maturador/config')}>
                Configurar Evolution API
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/maturador')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Instâncias de WhatsApp</h1>
              <p className="text-muted-foreground">Gerencie seus chips conectados</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Instância
            </Button>
          </div>
        </div>

        {/* Instances Grid */}
        {instances.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhuma instância</h3>
              <p className="text-muted-foreground mb-4">Adicione sua primeira instância de WhatsApp</p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Instância
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {instances.map((instance) => (
              <Card key={instance.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{instance.label || instance.instance_name}</CardTitle>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(instance.status)}`} />
                      {getStatusText(instance.status)}
                    </Badge>
                  </div>
                  <CardDescription>
                    {instance.phone_number || instance.instance_name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {instance.last_seen 
                      ? `Último acesso: ${new Date(instance.last_seen).toLocaleString('pt-BR')}`
                      : `Criado: ${new Date(instance.created_at).toLocaleString('pt-BR')}`
                    }
                  </p>
                  
                  <div className="flex gap-2 flex-wrap">
                    {instance.status !== 'connected' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleGetQrCode(instance)}
                        disabled={actionLoading === instance.id}
                      >
                        <QrCode className="h-3 w-3 mr-1" />
                        QR Code
                      </Button>
                    )}
                    
                    {instance.status === 'connected' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleLogout(instance)}
                        disabled={actionLoading === instance.id}
                      >
                        {actionLoading === instance.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <PowerOff className="h-3 w-3 mr-1" />
                        )}
                        Desconectar
                      </Button>
                    )}

                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleRestart(instance)}
                      disabled={actionLoading === instance.id}
                    >
                      {actionLoading === instance.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3 mr-1" />
                      )}
                      Reiniciar
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => {
                        setInstanceToDelete(instance);
                        setDeleteDialogOpen(true);
                      }}
                      disabled={actionLoading === instance.id}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Instance Modal */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Instância</DialogTitle>
              <DialogDescription>
                Crie uma nova instância para conectar um número de WhatsApp
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="instanceName">Nome da Instância</Label>
                <Input
                  id="instanceName"
                  placeholder="meu_chip_01"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
                <p className="text-xs text-muted-foreground">
                  Apenas letras minúsculas, números e underscores
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateInstance} disabled={creating || !newInstanceName}>
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QR Code Modal */}
        <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Conectar WhatsApp</DialogTitle>
              <DialogDescription>
                Escaneie o QR Code com o WhatsApp do número {currentQrInstance?.instance_name}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-6">
              {loadingQr ? (
                <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : qrCode ? (
                <div className="p-4 bg-white rounded-lg">
                  <img 
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} 
                    alt="QR Code" 
                    className="w-64 h-64"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                  <p className="text-muted-foreground">QR Code não disponível</p>
                </div>
              )}
              
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e escaneie o código
              </p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => handleGetQrCode(currentQrInstance!)} disabled={loadingQr}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingQr ? 'animate-spin' : ''}`} />
                Atualizar QR
              </Button>
              <Button onClick={handleCheckQrStatus} disabled={checkingStatus}>
                {checkingStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Power className="h-4 w-4 mr-2" />
                )}
                Verificar Conexão
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Instância</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a instância "{instanceToDelete?.instance_name}"? 
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
