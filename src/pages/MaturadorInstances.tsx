import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, RefreshCw, Loader2, Smartphone, QrCode, Trash2, PowerOff, RotateCcw, Phone, ChevronDown, ChevronRight, Hash, Wifi, MapPin, CheckCircle, XCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { splashedToast as toast } from "@/hooks/useSplashedToast";
import { useAutoCheckConnectingInstances } from "@/hooks/useAutoCheckConnectingInstances";
import { QRCodeModal, setQrCodeCache, clearQrCodeCache } from "@/components/QRCodeModal";
import { PairCodeModal } from "@/components/PairCodeModal";
import { useProxyValidator } from "@/hooks/useProxyValidator";
import { InstanceRenewalTag } from "@/components/credits/InstanceRenewalTag";
import { useInstanceSubscription } from "@/hooks/useInstanceSubscription";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  qrcode: string | null;
  last_seen: string | null;
  created_at: string;
  proxy_string: string | null;
}

export default function MaturadorInstances() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create instance modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Proxy configuration (optional) - now accepts SOCKS5 string only
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyString, setProxyString] = useState("");

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
  
  // Proxy validation (for create modal)
  const { validateProxy, validating: validatingProxy, result: proxyValidationResult, clearResult: clearProxyResult } = useProxyValidator();
  
  // Instance subscription for credits system
  const { registerInstance, freeInstancesRemaining } = useInstanceSubscription();
  
  // Card proxy validation state (per-instance)
  const [validatingInstanceProxy, setValidatingInstanceProxy] = useState<string | null>(null);
  const [instanceProxyResults, setInstanceProxyResults] = useState<Record<string, { ip?: string; location?: string; latency_ms?: number; error?: string }>>({});

  const fetchInstances = useCallback(async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      // Fetch instances from database
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);

    } catch (error) {
      console.error('Error fetching instances:', error);
      toast.error('Erro ao carregar números');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, user?.id]);

  // Webhook verification removed - webhooks are configured automatically on instance creation
  // This reduces unnecessary API calls and speeds up page load

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Auto-sync while there are instances stuck in "connecting" (updates without needing manual refresh)
  useAutoCheckConnectingInstances(instances, fetchInstances, { enabled: !!user, intervalMs: 4000 });

  const handleRefresh = async () => {
    setRefreshing(true);
    
    // Update status of all instances and reconfigure webhooks for connected ones
    for (const instance of instances) {
      try {
        await supabase.functions.invoke('maturador-evolution', {
          body: { action: 'check-status', instanceName: instance.instance_name },
        });
        
        // Reconfigure webhook if instance is connected
        if (instance.status === 'connected') {
          await supabase.functions.invoke('configure-webhook', {
            body: { instanceId: instance.id },
          });
        }
      } catch (error) {
        console.error(`Error for ${instance.instance_name}:`, error);
      }
    }
    
    await fetchInstances();
    setRefreshing(false);
    toast.success('Status e webhooks atualizados');
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
      
      // Reconfigure webhooks for all connected instances
      const userId = effectiveUserId || user?.id;
      const { data: currentInstances } = await supabase
        .from('maturador_instances')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'connected');
      
      if (currentInstances && currentInstances.length > 0) {
        await Promise.all(
          currentInstances.map(inst => 
            supabase.functions.invoke('configure-webhook', {
              body: { instanceId: inst.id },
            })
          )
        );
      }

      toast.success(`${syncedCount} número(s) sincronizado(s) e webhooks configurados!`);
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
    setProxyString("");
    clearProxyResult();
  };

  const handleValidateProxy = async () => {
    if (!proxyString) {
      toast.error('Digite a string de proxy primeiro');
      return;
    }
    await validateProxy(proxyString);
  };

  // Handle card WiFi icon click to validate instance proxy
  const handleValidateInstanceProxy = async (instance: Instance) => {
    if (!instance.proxy_string) {
      toast.info('Esta instância não tem proxy configurada');
      return;
    }
    
    setValidatingInstanceProxy(instance.id);
    try {
      const result = await validateProxy(instance.proxy_string);
      if (result) {
        setInstanceProxyResults(prev => ({
          ...prev,
          [instance.id]: {
            ip: result.ip,
            location: result.location,
            latency_ms: result.latency_ms,
            error: result.error,
          }
        }));
      }
    } finally {
      setValidatingInstanceProxy(null);
    }
  };

  // Parse SOCKS5 string format: socks5://username:password@host:port
  const parseSocks5String = (str: string) => {
    try {
      const regex = /^socks5:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/;
      const match = str.match(regex);
      if (match) {
        return {
          protocol: 'socks5',
          username: match[1],
          password: match[2],
          host: match[3],
          port: match[4]
        };
      }
      return null;
    } catch {
      return null;
    }
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
      
      if (proxyEnabled && proxyString) {
        const parsed = parseSocks5String(proxyString);
        if (parsed) {
          body.proxy = parsed;
        } else {
          toast.error('Formato de proxy inválido. Use: socks5://usuario:senha@host:porta');
          setCreating(false);
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke('maturador-evolution', { body });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Número criado com sucesso!');
      setCreateModalOpen(false);
      resetCreateForm();
      
      // Save proxy_string to instance if provided
      if (proxyEnabled && proxyString && data.instanceId) {
        await supabase
          .from('maturador_instances')
          .update({ proxy_string: proxyString })
          .eq('id', data.instanceId);
      }
      
      // Register instance subscription for credits system
      if (data.instanceId) {
        await registerInstance(data.instanceId);
      }
      
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
    if (!currentQrInstance || loadingQr) return;
    setLoadingQr(true);
    setQrCode(null);
    
    clearQrCodeCache(currentQrInstance.instance_name);
    
    try {
      console.log(`[QR-REFRESH] Requesting new QR for ${currentQrInstance.instance_name}`);
      
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
        await fetchInstances();
        return;
      }

      const qr = data.base64 || data.qrcode?.base64 || data.qrcode;
      if (qr) {
        setQrCodeCache(currentQrInstance.instance_name, qr);
        setQrCode(qr);
      } else {
        toast.error('QR Code não disponível');
      }
    } catch (error: any) {
      console.error('[QR-REFRESH] Error:', error);
      toast.error(error.message || 'Erro ao atualizar QR Code');
    } finally {
      setLoadingQr(false);
    }
  }, [currentQrInstance, loadingQr]);

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
      // UazAPI: only treat as connected when connected=true AND loggedIn=true (per docs)
      // BUT only if NOT connecting
      const isConnected = !isConnecting && (
        // Evolution API format
        data.instance?.state === 'open' ||
        // UazAPI format
        (data.status?.connected === true && data.status?.loggedIn === true) ||
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

      // Reconfigure webhook to ensure connection event is included
      await supabase.functions.invoke('configure-webhook', {
        body: { instanceId: instance.id },
      });

      toast.success('Número reiniciado e webhook configurado');
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
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{instance.label || instance.phone_number || instance.instance_name}</CardTitle>
                      {/* Proxy WiFi indicator */}
                      {instance.proxy_string && (
                        <button
                          onClick={() => handleValidateInstanceProxy(instance)}
                          disabled={validatingInstanceProxy === instance.id}
                          className={`p-1 rounded hover:bg-muted transition-colors ${
                            instanceProxyResults[instance.id]?.ip && !instanceProxyResults[instance.id]?.error
                              ? 'text-green-500' 
                              : instanceProxyResults[instance.id]?.error 
                                ? 'text-red-500' 
                                : 'text-muted-foreground'
                          }`}
                          title={
                            instanceProxyResults[instance.id]?.ip 
                              ? `IP: ${instanceProxyResults[instance.id].ip}${instanceProxyResults[instance.id].location ? ` | ${instanceProxyResults[instance.id].location}` : ''}` 
                              : 'Clique para validar proxy'
                          }
                        >
                          {validatingInstanceProxy === instance.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wifi className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                    <Badge variant="outline" className={`flex items-center gap-1 ${instance.status === 'connected' ? 'border-green-500 text-green-500' : ''}`}>
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(instance.status)}`} />
                      {getStatusText(instance.status)}
                    </Badge>
                  </div>
                  {/* Show proxy IP/location info if available */}
                  {instance.proxy_string && instanceProxyResults[instance.id]?.ip && (
                    <div className="flex items-center gap-1 text-xs">
                      {instanceProxyResults[instance.id]?.error ? (
                        <span className="text-red-500">{instanceProxyResults[instance.id].error}</span>
                      ) : (
                        <>
                          <Wifi className="h-3 w-3 text-green-500" />
                          <span className="text-green-500">
                            IP: {instanceProxyResults[instance.id].ip}
                          </span>
                          {instanceProxyResults[instance.id].location && (
                            <>
                              <MapPin className="h-3 w-3 ml-1 text-muted-foreground" />
                              <span className="text-muted-foreground">{instanceProxyResults[instance.id].location}</span>
                            </>
                          )}
                          {instanceProxyResults[instance.id].latency_ms && (
                            <span className="text-muted-foreground ml-1">
                              ({instanceProxyResults[instance.id].latency_ms}ms)
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <CardDescription className="flex items-center gap-2">
                    {instance.phone_number || instance.instance_name}
                    <InstanceRenewalTag instanceId={instance.id} />
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
                      <>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setCurrentPairCodeInstance(instance);
                            setPairCodeModalOpen(true);
                          }}
                          disabled={actionLoading === instance.id}
                        >
                          <Hash className="h-3 w-3 mr-1" />
                          Código
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleGetQrCode(instance)}
                          disabled={actionLoading === instance.id}
                        >
                          <QrCode className="h-3 w-3 mr-1" />
                          {instance.status === 'connecting' ? 'Ver QR' : 'QR Code'}
                        </Button>
                      </>
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
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="space-y-2">
                    <Label htmlFor="proxyString">String SOCKS5 do Marketplace</Label>
                    <Input
                      id="proxyString"
                      placeholder="socks5://usuario:senha@host:porta"
                      value={proxyString}
                      onChange={(e) => {
                        setProxyString(e.target.value);
                        clearProxyResult();
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Cole a string de proxy gerada pelo Marketplace no formato SOCKS5
                    </p>
                    
                    {/* Validate Proxy Button */}
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={handleValidateProxy}
                      disabled={validatingProxy || !proxyString}
                      className="w-full"
                    >
                      {validatingProxy ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Wifi className="h-4 w-4 mr-2" />
                      )}
                      Validar IP
                    </Button>
                    
                    {/* Validation Result */}
                    {proxyValidationResult && (
                      <div className={`p-3 rounded-lg border ${proxyValidationResult.valid ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {proxyValidationResult.valid ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className={`text-sm font-medium ${proxyValidationResult.valid ? 'text-green-500' : 'text-red-500'}`}>
                            {proxyValidationResult.valid ? 'Proxy Válida' : 'Proxy Inválida'}
                          </span>
                        </div>
                        {proxyValidationResult.valid && proxyValidationResult.ip && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="font-medium">IP:</span> {proxyValidationResult.ip}
                            </div>
                            {proxyValidationResult.location && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span>{proxyValidationResult.location}</span>
                              </div>
                            )}
                            {proxyValidationResult.latency_ms && (
                              <div className="flex items-center gap-1">
                                <span className="font-medium">Latência:</span> {proxyValidationResult.latency_ms}ms
                              </div>
                            )}
                          </div>
                        )}
                        {!proxyValidationResult.valid && proxyValidationResult.error && (
                          <p className="text-xs text-red-400">{proxyValidationResult.error}</p>
                        )}
                      </div>
                    )}
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

        {/* Pair Code Modal */}
        <PairCodeModal
          open={pairCodeModalOpen}
          onOpenChange={setPairCodeModalOpen}
          instanceName={currentPairCodeInstance?.instance_name || ''}
          onSuccess={fetchInstances}
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
