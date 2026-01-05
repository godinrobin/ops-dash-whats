import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Plus, RefreshCw, Loader2, Smartphone, QrCode, Trash2, PowerOff, RotateCcw, Phone, ChevronDown, ChevronRight, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { splashedToast as toast } from "@/hooks/useSplashedToast";
import { QRCodeModal, setQrCodeCache, clearQrCodeCache } from "@/components/QRCodeModal";
import { PairCodeModal } from "@/components/PairCodeModal";
import { Header } from "@/components/Header";

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

export default function TagWhatsAddNumber() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create instance modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Proxy configuration (optional)
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [proxyProtocol, setProxyProtocol] = useState("http");
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");

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

  // Pair code modal
  const [pairCodeModalOpen, setPairCodeModalOpen] = useState(false);
  const [currentPairCodeInstance, setCurrentPairCodeInstance] = useState<Instance | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchInstances = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);

    } catch (error) {
      console.error('Error fetching instances:', error);
      toast.error('Erro ao carregar números');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    
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

  const handleSyncPhoneNumbers = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'sync-phone-numbers' },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const syncedCount = data.results?.filter((r: any) => r.phoneNumber).length || 0;
      toast.success(`${syncedCount} número(s) sincronizado(s)!`);
      await fetchInstances();
    } catch (error: any) {
      console.error('Error syncing phone numbers:', error);
      toast.error(error.message || 'Erro ao sincronizar números');
    } finally {
      setSyncing(false);
    }
  };

  const resetCreateForm = () => {
    setNewInstanceName("");
    setProxyEnabled(false);
    setProxyHost("");
    setProxyPort("");
    setProxyProtocol("http");
    setProxyUsername("");
    setProxyPassword("");
  };

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      toast.error('Nome do número é obrigatório');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newInstanceName)) {
      toast.error('O nome deve conter apenas letras, números e underscores');
      return;
    }

    setCreating(true);
    try {
      const body: any = { action: 'create-instance', instanceName: newInstanceName };
      
      if (proxyEnabled && proxyHost && proxyPort) {
        body.proxy = {
          host: proxyHost,
          port: proxyPort,
          protocol: proxyProtocol,
          username: proxyUsername || undefined,
          password: proxyPassword || undefined,
        };
      }

      const { data, error } = await supabase.functions.invoke('maturador-evolution', { body });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Número criado com sucesso!');
      setCreateModalOpen(false);
      resetCreateForm();
      
      await fetchInstances();
      
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
      toast.error(error.message || 'Erro ao criar número');
    } finally {
      setCreating(false);
    }
  };

  const handleGetQrCode = useCallback(async (instance: Instance) => {
    setCurrentQrInstance(instance);
    setQrModalOpen(true);
    setLoadingQr(true);
    setQrCode(null);
    
    clearQrCodeCache(instance.instance_name);

    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'get-qrcode', instanceName: instance.instance_name },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      if (data.connected) {
        toast.success('WhatsApp já está conectado!');
        setQrModalOpen(false);
        await fetchInstances();
        return;
      }
      
      const qr = data.base64 || data.qrcode?.base64 || data.qrcode;
      if (qr) {
        setQrCodeCache(instance.instance_name, qr);
        setQrCode(qr);
      } else {
        toast.error('QR Code não disponível. Tente novamente.');
      }
    } catch (error: any) {
      console.error('Error getting QR code:', error);
      toast.error(error.message || 'Erro ao obter QR Code');
      setQrModalOpen(false);
    } finally {
      setLoadingQr(false);
      await fetchInstances();
    }
  }, []);

  const handleRefreshQrCode = useCallback(async () => {
    if (!currentQrInstance || loadingQr) return;
    setLoadingQr(true);
    setQrCode(null);
    
    clearQrCodeCache(currentQrInstance.instance_name);
    
    const maxAttempts = 2;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('maturador-evolution', {
          body: { 
            action: 'get-qrcode', 
            instanceName: currentQrInstance.instance_name,
            forceNew: true
          },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);
        
        if (data.connected) {
          toast.success('WhatsApp já está conectado!');
          setQrModalOpen(false);
          setLoadingQr(false);
          await fetchInstances();
          return;
        }

        const qr = data.base64 || data.qrcode?.base64 || data.qrcode;
        if (qr) {
          setQrCodeCache(currentQrInstance.instance_name, qr);
          setQrCode(qr);
          setLoadingQr(false);
          return;
        } else {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          toast.error('QR Code não disponível');
        }
      } catch (error: any) {
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }
    
    if (lastError) {
      toast.error(lastError.message || 'Erro ao atualizar QR Code');
    }
    
    setLoadingQr(false);
  }, [currentQrInstance, loadingQr]);

  const handleCheckQrStatus = async () => {
    if (!currentQrInstance) return;
    
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'check-status', instanceName: currentQrInstance.instance_name },
      });

      if (error) throw error;

      const rawInstanceStatus = data?.instance?.status;
      const isConnecting = 
        rawInstanceStatus === 'connecting' ||
        data?.status === 'connecting' ||
        (data?.status?.loggedIn === true && data?.status?.connected === false);

      const isConnected = !isConnecting && (
        data.instance?.state === 'open' ||
        data.status?.connected === true ||
        rawInstanceStatus === 'connected' ||
        data.connected === true
      );

      if (isConnected) {
        toast.success('WhatsApp conectado com sucesso!');
        setQrModalOpen(false);
        await fetchInstances();
      } else if (isConnecting) {
        toast.info('Conectando... aguarde a sincronização');
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

      toast.success('Número desconectado');
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

      toast.success('Número reiniciado');
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
    setDeleteDialogOpen(false);
    toast.info('Excluindo instância...');
    
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'delete-instance', instanceName: instanceToDelete.instance_name },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Número removido');
      setInstanceToDelete(null);
      await fetchInstances();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(error.message || 'Erro ao remover número');
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

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/tag-whats/cloud')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Adicionar Número</h1>
                <p className="text-muted-foreground">Gerencie seus chips para o Tag Whats Cloud</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSyncPhoneNumbers} disabled={syncing || refreshing}>
                {syncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4 mr-2" />
                )}
                Sincronizar Números
              </Button>
              <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing || syncing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Número
              </Button>
            </div>
          </div>

          {/* Instances Grid */}
          {instances.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum número cadastrado</h3>
                <p className="text-muted-foreground mb-4">
                  Adicione seu primeiro número para começar a usar o Tag Whats Cloud
                </p>
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Número
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {instances.map((instance) => (
                <Card key={instance.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">
                          {instance.label || instance.phone_number || instance.instance_name}
                        </CardTitle>
                      </div>
                      <Badge className={`${getStatusColor(instance.status)} text-white`}>
                        {getStatusText(instance.status)}
                      </Badge>
                    </div>
                    {instance.phone_number && instance.label && (
                      <CardDescription>{instance.phone_number}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 flex-wrap">
                      {instance.status !== 'connected' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCurrentPairCodeInstance(instance);
                              setPairCodeModalOpen(true);
                            }}
                          >
                            <Hash className="h-4 w-4 mr-1" />
                            Código
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGetQrCode(instance)}
                          >
                            <QrCode className="h-4 w-4 mr-1" />
                            QR Code
                          </Button>
                        </>
                      )}
                      {instance.status === 'connected' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLogout(instance)}
                          disabled={actionLoading === instance.id}
                        >
                          {actionLoading === instance.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <PowerOff className="h-4 w-4 mr-1" />
                          )}
                          Desconectar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestart(instance)}
                        disabled={actionLoading === instance.id}
                      >
                        {actionLoading === instance.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4 mr-1" />
                        )}
                        Reiniciar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setInstanceToDelete(instance);
                          setDeleteDialogOpen(true);
                        }}
                        disabled={deleting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Create Instance Modal */}
          <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Adicionar Novo Número</DialogTitle>
                <DialogDescription>
                  Crie uma nova instância para conectar um número de WhatsApp
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="instanceName">Nome da Instância</Label>
                  <Input
                    id="instanceName"
                    placeholder="Ex: meu_whatsapp"
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                    disabled={creating}
                  />
                  <p className="text-xs text-muted-foreground">
                    Apenas letras, números e underscores
                  </p>
                </div>

                <Collapsible open={proxyEnabled} onOpenChange={setProxyEnabled}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      Configuração de Proxy (Opcional)
                      {proxyEnabled ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="proxyHost">Host</Label>
                        <Input
                          id="proxyHost"
                          placeholder="proxy.example.com"
                          value={proxyHost}
                          onChange={(e) => setProxyHost(e.target.value)}
                          disabled={creating}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="proxyPort">Porta</Label>
                        <Input
                          id="proxyPort"
                          placeholder="8080"
                          value={proxyPort}
                          onChange={(e) => setProxyPort(e.target.value)}
                          disabled={creating}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="proxyUsername">Usuário</Label>
                        <Input
                          id="proxyUsername"
                          placeholder="usuário"
                          value={proxyUsername}
                          onChange={(e) => setProxyUsername(e.target.value)}
                          disabled={creating}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="proxyPassword">Senha</Label>
                        <Input
                          id="proxyPassword"
                          type="password"
                          placeholder="senha"
                          value={proxyPassword}
                          onChange={(e) => setProxyPassword(e.target.value)}
                          disabled={creating}
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateModalOpen(false)} disabled={creating}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateInstance} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Criar Número'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* QR Code Modal */}
          <QRCodeModal
            open={qrModalOpen}
            onOpenChange={setQrModalOpen}
            instanceName={currentQrInstance?.instance_name || ''}
            qrCode={qrCode}
            loading={loadingQr}
            onRefreshQr={handleRefreshQrCode}
            onCheckStatus={handleCheckQrStatus}
            checkingStatus={checkingStatus}
          />

          {/* Pair Code Modal */}
          <PairCodeModal
            open={pairCodeModalOpen}
            onOpenChange={setPairCodeModalOpen}
            instanceName={currentPairCodeInstance?.instance_name || ''}
            onSuccess={fetchInstances}
          />

          {/* Delete Dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover Número</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja remover o número "{instanceToDelete?.label || instanceToDelete?.phone_number || instanceToDelete?.instance_name}"?
                  Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? 'Removendo...' : 'Remover'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  );
}
