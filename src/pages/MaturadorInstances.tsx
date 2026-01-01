import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, RefreshCw, Loader2, Smartphone, QrCode, Trash2, PowerOff, RotateCcw, Phone, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { splashedToast as toast } from "@/hooks/useSplashedToast";
import { QRCodeModal, setQrCodeCache, clearQrCodeCache } from "@/components/QRCodeModal";

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

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchInstances = async () => {
    if (!user) return;

    try {
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
      toast.error('Erro ao carregar números');
    } finally {
      setLoading(false);
    }
  };

  // Verify and configure webhooks for connected instances in the background
  const verifyWebhooks = async () => {
    try {
      console.log('[VERIFY-WEBHOOKS] Starting background webhook verification');
      const { data, error } = await supabase.functions.invoke('verify-webhooks', {});
      if (error) {
        console.error('[VERIFY-WEBHOOKS] Error:', error);
      } else {
        console.log('[VERIFY-WEBHOOKS] Result:', data);
      }
    } catch (error) {
      console.error('[VERIFY-WEBHOOKS] Error:', error);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, [user]);

  // Verify webhooks after instances are loaded
  useEffect(() => {
    if (instances.length > 0 && !loading) {
      verifyWebhooks();
    }
  }, [instances, loading]);

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
    
    // Clear old cache to ensure fresh QR
    clearQrCodeCache(instance.instance_name);

    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'get-qrcode', instanceName: instance.instance_name },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      // Check if already connected
      if (data.connected) {
        toast.success('WhatsApp já está conectado!');
        setQrModalOpen(false);
        await fetchInstances();
        return;
      }
      
      // UazAPI returns QR as data URI inside base64 or as instance.qrcode
      const qr = data.base64 || data.qrcode?.base64 || data.qrcode;
      if (qr) {
        setQrCodeCache(instance.instance_name, qr);
        setQrCode(qr);
      } else {
        console.log('[GET-QR] No QR in response:', JSON.stringify(data).substring(0, 200));
        toast.error('QR Code não disponível. Tente novamente.');
      }
    } catch (error: any) {
      console.error('Error getting QR code:', error);
      toast.error(error.message || 'Erro ao obter QR Code');
      setQrModalOpen(false);
    } finally {
      setLoadingQr(false);
      // Refresh instances to update status from backend
      await fetchInstances();
    }
  }, []);

  const handleRefreshQrCode = useCallback(async () => {
    if (!currentQrInstance) return;
    setLoadingQr(true);
    setQrCode(null);
    
    // Clear cache to force fresh QR
    clearQrCodeCache(currentQrInstance.instance_name);
    
    const maxAttempts = 2;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[QR-REFRESH] Attempt ${attempt}/${maxAttempts} for ${currentQrInstance.instance_name}`);
        
        const { data, error } = await supabase.functions.invoke('maturador-evolution', {
          body: { 
            action: 'get-qrcode', 
            instanceName: currentQrInstance.instance_name,
            forceNew: true // Force new QR code generation
          },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);
        
        // Check if instance is already connected
        if (data.connected) {
          toast.success('WhatsApp já está conectado!');
          setQrModalOpen(false);
          await fetchInstances();
          return;
        }

        // UazAPI returns QR as data URI inside base64 or as instance.qrcode
        const qr = data.base64 || data.qrcode?.base64 || data.qrcode;
        if (qr) {
          console.log(`[QR-REFRESH] Got QR code, length: ${qr.length}`);
          setQrCodeCache(currentQrInstance.instance_name, qr);
          setQrCode(qr);
          return; // Success - exit retry loop
        } else {
          console.log('[QR-REFRESH] No QR in response:', JSON.stringify(data).substring(0, 200));
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000)); // Wait before retry
            continue;
          }
          toast.error('QR Code não disponível');
        }
      } catch (error: any) {
        console.error(`[QR-REFRESH] Error on attempt ${attempt}:`, error);
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000)); // Wait before retry
          continue;
        }
      }
    }
    
    // All attempts failed
    if (lastError) {
      toast.error(lastError.message || 'Erro ao atualizar QR Code');
    }
    
    setLoadingQr(false);
  }, [currentQrInstance]);

  const handleCheckQrStatus = async () => {
    if (!currentQrInstance) return;
    
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'check-status', instanceName: currentQrInstance.instance_name },
      });

      if (error) throw error;

      // Check if status is "connecting" FIRST - takes priority
      const rawInstanceStatus = data?.instance?.status;
      const isConnecting = 
        rawInstanceStatus === 'connecting' ||
        data?.status === 'connecting' ||
        (data?.status?.loggedIn === true && data?.status?.connected === false);

      // Check for connection status - support both Evolution and UazAPI formats
      // BUT only if NOT connecting
      const isConnected = !isConnecting && (
        // Evolution API format
        data.instance?.state === 'open' ||
        // UazAPI format - multiple possible response shapes
        data.status?.connected === true ||
        rawInstanceStatus === 'connected' ||
        data.connected === true
      );

      if (isConnected) {
        toast.success('WhatsApp conectado com sucesso!');
        setQrModalOpen(false);
        await fetchInstances();
      } else if (isConnecting) {
        // Keep modal open when connecting - user needs to wait
        toast.info('Conectando... aguarde a sincronização');
        // Refresh instances to update status but keep modal open
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/maturador')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Números de WhatsApp</h1>
              <p className="text-muted-foreground">Gerencie seus chips conectados</p>
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
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhum número</h3>
              <p className="text-muted-foreground mb-4">Adicione seu primeiro número de WhatsApp</p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Número
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {instances.map((instance) => (
              <Card key={instance.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{instance.label || instance.phone_number || instance.instance_name}</CardTitle>
                    <Badge variant="outline" className={`flex items-center gap-1 ${instance.status === 'connected' ? 'border-green-500 text-green-500' : ''}`}>
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
                    {/* Show QR Code button for disconnected OR connecting instances */}
                    {(instance.status === 'disconnected' || instance.status === 'connecting') && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleGetQrCode(instance)}
                        disabled={actionLoading === instance.id}
                      >
                        <QrCode className="h-3 w-3 mr-1" />
                        {instance.status === 'connecting' ? 'Ver QR Code' : 'Gerar QR Code'}
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
              <DialogTitle>Novo Número</DialogTitle>
              <DialogDescription>
                Crie um novo registro para conectar um número de WhatsApp
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="instanceName">Nome identificador</Label>
                <Input
                  id="instanceName"
                  placeholder="meu_numero_01"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
                <p className="text-xs text-muted-foreground">Apenas letras minúsculas, números e underscores</p>
              </div>

              <Collapsible open={proxyEnabled} onOpenChange={setProxyEnabled}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between">
                    <span>Configurar Proxy (opcional)</span>
                    {proxyEnabled ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Host</Label>
                      <Input placeholder="proxy.example.com" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Porta</Label>
                      <Input placeholder="8080" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Protocolo</Label>
                    <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" value={proxyProtocol} onChange={(e) => setProxyProtocol(e.target.value)}>
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                      <option value="socks4">SOCKS4</option>
                      <option value="socks5">SOCKS5</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Usuário (opcional)</Label>
                      <Input placeholder="username" value={proxyUsername} onChange={(e) => setProxyUsername(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Senha (opcional)</Label>
                      <Input type="password" placeholder="password" value={proxyPassword} onChange={(e) => setProxyPassword(e.target.value)} />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
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
        <QRCodeModal
          open={qrModalOpen}
          onOpenChange={setQrModalOpen}
          instanceName={currentQrInstance?.instance_name || ''}
          qrCode={qrCode}
          loading={loadingQr}
          onCheckStatus={handleCheckQrStatus}
          onRefreshQr={handleRefreshQrCode}
          checkingStatus={checkingStatus}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => !deleting && setDeleteDialogOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleting ? 'Excluindo...' : 'Excluir Número'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleting ? (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <Loader2 className="h-10 w-10 animate-spin text-destructive" />
                    <p className="text-center">
                      Removendo "{instanceToDelete?.label || instanceToDelete?.phone_number || instanceToDelete?.instance_name}" do sistema...
                    </p>
                    <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
                  </div>
                ) : (
                  <>
                    Tem certeza que deseja excluir "{instanceToDelete?.label || instanceToDelete?.phone_number || instanceToDelete?.instance_name}"? 
                    Esta ação não pode ser desfeita.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {!deleting && (
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            )}
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
