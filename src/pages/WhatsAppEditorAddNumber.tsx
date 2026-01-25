import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  ArrowLeft, Plus, RefreshCw, Loader2, QrCode, Trash2, PowerOff, 
  RotateCcw, CheckCircle2, XCircle, Smartphone, Settings, Copy, Hash, Wallet
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/utils/phoneFormatter";
import { cn } from "@/lib/utils";
import { PairCodeModal } from "@/components/PairCodeModal";
import { useCredits } from "@/hooks/useCredits";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { InsufficientCreditsModal } from "@/components/credits/InsufficientCreditsModal";

const FREE_INSTANCES_LIMIT = 3;
const INSTANCE_COST = 6;

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  uazapi_token: string | null;
  qrcode: string | null;
}

export default function WhatsAppEditorAddNumber() {
  useActivityTracker("page_visit", "Edição de WhatsApp - Adicionar Número");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();

  // Credits system
  const { 
    isActive: isCreditsActive, 
    isAdminTesting, 
    isSimulatingPartial, 
    isSemiFullMember,
    loading: creditsLoading 
  } = useCreditsSystem();
  const { isFullMember } = useAccessLevel();
  const { balance, loading: balanceLoading, canAfford, deductCredits } = useCredits();

  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Pair code modal
  const [pairCodeModalOpen, setPairCodeModalOpen] = useState(false);
  const [currentPairCodeInstance, setCurrentPairCodeInstance] = useState<Instance | null>(null);

  // Insufficient credits modal
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);

  // Confirmation modal for paid instances
  const [showConfirmPurchaseModal, setShowConfirmPurchaseModal] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, phone_number, label, status, uazapi_token, qrcode')
        .eq('user_id', userId)
        .not('uazapi_token', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);
    } catch (error) {
      console.error('Error fetching instances:', error);
      toast.error('Erro ao carregar instâncias');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, effectiveUserId]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchInstances();
  };

  const handleCreateInstance = () => {
    if (!newInstanceName.trim()) {
      toast.error('Digite um nome para a instância');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newInstanceName)) {
      toast.error('O nome deve conter apenas letras, números e underscores');
      return;
    }

    // Check if credits system is active (including test modes and semi-full members)
    const isCreditsRequired = isCreditsActive || isAdminTesting || isSimulatingPartial || isSemiFullMember;
    
    if (isCreditsRequired) {
      // Determine effective full member status
      const effectiveFM = (isSimulatingPartial || isSemiFullMember) ? false : isFullMember;
      
      // Count current connected instances
      const connectedCount = instances.filter(i => 
        i.status === 'connected' || i.status === 'open'
      ).length;
      
      // Check if user has free slots available
      const hasFreeSlot = effectiveFM && connectedCount < FREE_INSTANCES_LIMIT;
      
      if (!hasFreeSlot) {
        // Show confirmation modal for paid instance
        setShowConfirmPurchaseModal(true);
        return;
      }
    }

    // Free instance or credits not required - create directly
    handleConfirmCreate();
  };

  const handleConfirmCreate = async () => {
    // Wait for credits system to fully load
    if (creditsLoading || balanceLoading) {
      toast.error('Aguarde, carregando informações...');
      return;
    }

    // DEBUG: Log all credit system states
    console.log('[CREATE-INSTANCE] Credit System States:', {
      isCreditsActive,
      isAdminTesting,
      isSimulatingPartial,
      isSemiFullMember,
      isFullMember,
      creditsLoading,
      balanceLoading,
      balance
    });

    if (!newInstanceName.trim()) {
      toast.error('Digite um nome para a instância');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newInstanceName)) {
      toast.error('O nome deve conter apenas letras, números e underscores');
      return;
    }

    // Check if credits system is active (including test modes and semi-full members)
    const isCreditsRequired = isCreditsActive || isAdminTesting || isSimulatingPartial || isSemiFullMember;
    
    console.log('[CREATE-INSTANCE] Credits required?', isCreditsRequired);
    
    if (isCreditsRequired) {
      // Determine effective full member status (partial simulation or semi-full = not full member for free tier)
      const effectiveFM = (isSimulatingPartial || isSemiFullMember) ? false : isFullMember;
      
      // Count current connected instances
      const connectedCount = instances.filter(i => 
        i.status === 'connected' || i.status === 'open'
      ).length;
      
      console.log('[CREATE-INSTANCE] Effective Full Member:', effectiveFM, 'Connected:', connectedCount);
      
      // Check if user has free slots available
      const hasFreeSlot = effectiveFM && connectedCount < FREE_INSTANCES_LIMIT;
      
      console.log('[CREATE-INSTANCE] Has free slot?', hasFreeSlot);
      
      if (!hasFreeSlot) {
        // Need to pay 6 credits for this instance
        console.log('[CREATE-INSTANCE] Checking if can afford', INSTANCE_COST, 'credits');
        
        if (!canAfford(INSTANCE_COST)) {
          console.log('[CREATE-INSTANCE] Cannot afford, showing modal');
          setShowConfirmPurchaseModal(false);
          setShowInsufficientCreditsModal(true);
          return;
        }
        
        // Deduct credits BEFORE creating instance
        console.log('[CREATE-INSTANCE] Deducting credits...');
        const success = await deductCredits(
          INSTANCE_COST, 
          'instancia_whatsapp', 
          'Criação de instância WhatsApp (30 dias)'
        );
        
        console.log('[CREATE-INSTANCE] Deduction result:', success);
        
        if (!success) {
          setShowConfirmPurchaseModal(false);
          toast.error('Erro ao processar pagamento de créditos');
          return;
        }

        toast.success(`${INSTANCE_COST} créditos debitados com sucesso!`);
      } else {
        console.log('[CREATE-INSTANCE] Free slot available, skipping payment');
      }
    } else {
      console.log('[CREATE-INSTANCE] Credits not required, creating for free');
    }

    setCreating(true);
    try {
      const userId = effectiveUserId || user?.id;
      
      // Call the maturador-evolution edge function to create instance
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'create',
          instanceName: newInstanceName.trim().toLowerCase().replace(/\s+/g, '_'),
        },
      });

      if (error) throw error;

      // Save to database
      const { error: insertError } = await supabase
        .from('maturador_instances')
        .insert({
          user_id: userId,
          instance_name: data.instance?.name || newInstanceName,
          status: 'disconnected',
          uazapi_token: data.instance?.token || null,
        });

      if (insertError) throw insertError;

      toast.success('Instância criada com sucesso');
      setCreateModalOpen(false);
      setShowConfirmPurchaseModal(false);
      setNewInstanceName('');
      fetchInstances();
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
        body: {
          action: 'connect',
          instanceName: instance.instance_name,
        },
      });

      if (error) throw error;

      if (data.qrcode) {
        setQrCode(data.qrcode);
      } else if (data.status === 'connected') {
        toast.success('WhatsApp já está conectado!');
        setQrModalOpen(false);
        fetchInstances();
      }
    } catch (error: any) {
      console.error('Error getting QR code:', error);
      toast.error(error.message || 'Erro ao obter QR Code');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleRefreshQr = async () => {
    if (!currentQrInstance) return;
    
    setLoadingQr(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'connect',
          instanceName: currentQrInstance.instance_name,
        },
      });

      if (error) throw error;

      if (data.qrcode) {
        setQrCode(data.qrcode);
      } else if (data.status === 'connected') {
        toast.success('WhatsApp conectado!');
        setQrModalOpen(false);
        fetchInstances();
      }
    } catch (error: any) {
      console.error('Error refreshing QR:', error);
      toast.error(error.message || 'Erro ao atualizar QR Code');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!currentQrInstance) return;

    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'status',
          instanceName: currentQrInstance.instance_name,
        },
      });

      if (error) throw error;

      if (data.status === 'connected' || data.status === 'open') {
        toast.success('WhatsApp conectado com sucesso!');
        setQrModalOpen(false);
        fetchInstances();
      } else {
        toast.info('Aguardando conexão...');
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
      const { error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'logout',
          instanceName: instance.instance_name,
        },
      });

      if (error) throw error;

      // Update status in database
      await supabase
        .from('maturador_instances')
        .update({ status: 'disconnected', phone_number: null })
        .eq('id', instance.id);

      toast.success('WhatsApp desconectado');
      fetchInstances();
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
      const { error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'restart',
          instanceName: instance.instance_name,
        },
      });

      if (error) throw error;

      toast.success('Instância reiniciada');
      fetchInstances();
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
      // Delete from Evolution API
      await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'delete',
          instanceName: instanceToDelete.instance_name,
        },
      });

      // Delete from database
      await supabase
        .from('maturador_instances')
        .delete()
        .eq('id', instanceToDelete.id);

      toast.success('Instância deletada');
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
      fetchInstances();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(error.message || 'Erro ao deletar');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500/20 text-green-500">Conectado</Badge>;
      case 'disconnected':
        return <Badge variant="secondary">Desconectado</Badge>;
      case 'connecting':
        return <Badge className="bg-yellow-500/20 text-yellow-500">Conectando</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando instâncias...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="container mx-auto max-w-4xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/whatsapp-editor")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Gerenciar Números</h1>
              <p className="text-sm text-muted-foreground">
                Adicione ou gerencie seus números do WhatsApp
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{instances.length} números cadastrados</span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
                Atualizar
              </Button>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Número
              </Button>
            </div>
          </div>

          {/* Instances List */}
          {instances.length === 0 ? (
            <Card className="p-12 text-center">
              <Smartphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum número cadastrado</h3>
              <p className="text-muted-foreground mb-4">
                Clique no botão acima para adicionar seu primeiro número
              </p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Número
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {instances.map((instance) => (
                <Card key={instance.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium truncate">
                            {instance.label || instance.instance_name}
                          </p>
                          {getStatusBadge(instance.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {instance.phone_number ? formatPhoneDisplay(instance.phone_number) : 'Aguardando conexão'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {instance.status === 'connected' ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestart(instance)}
                              disabled={actionLoading === instance.id}
                            >
                              {actionLoading === instance.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLogout(instance)}
                              disabled={actionLoading === instance.id}
                            >
                              <PowerOff className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
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
                              variant="default"
                              size="sm"
                              onClick={() => handleGetQrCode(instance)}
                            >
                              <QrCode className="h-4 w-4 mr-2" />
                              QR Code
                            </Button>
                          </>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setInstanceToDelete(instance);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Instance Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Novo Número</DialogTitle>
            <DialogDescription>
              Crie uma nova instância para conectar seu WhatsApp
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Instância</Label>
              <Input
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                placeholder="Ex: meu_numero_principal"
              />
              <p className="text-xs text-muted-foreground">
                Use apenas letras, números e underscore
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateInstance} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Purchase Modal */}
      <Dialog open={showConfirmPurchaseModal} onOpenChange={setShowConfirmPurchaseModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Confirmar Criação de Instância
            </DialogTitle>
            <DialogDescription>
              Esta ação irá consumir créditos do seu saldo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Instância:</span>
                <span className="font-medium">{newInstanceName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Período:</span>
                <span className="font-medium">30 dias</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-medium">Custo:</span>
                <span className="text-lg font-bold text-primary">{INSTANCE_COST} créditos</span>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/10 border border-accent/20">
              <Wallet className="h-4 w-4 text-accent" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Saldo atual</p>
                <p className="font-semibold">{balance.toFixed(2)} créditos</p>
              </div>
              {balance < INSTANCE_COST && (
                <Badge variant="destructive">Insuficiente</Badge>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmPurchaseModal(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmCreate} 
              disabled={creating || balance < INSTANCE_COST}
              className="bg-primary"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmar e Criar
                </>
              )}
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
              Escaneie o QR Code com seu WhatsApp
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-4">
            {loadingQr ? (
              <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : qrCode ? (
              <img 
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} 
                alt="QR Code" 
                className="w-64 h-64 object-contain rounded-lg"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                <p className="text-muted-foreground">QR Code não disponível</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleRefreshQr} disabled={loadingQr}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loadingQr && "animate-spin")} />
              Atualizar QR
            </Button>
            <Button onClick={handleCheckStatus} disabled={checkingStatus}>
              {checkingStatus ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
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
            <AlertDialogTitle>Deletar Instância</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar a instância "{instanceToDelete?.label || instanceToDelete?.instance_name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Deletar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pair Code Modal */}
      <PairCodeModal
        open={pairCodeModalOpen}
        onOpenChange={setPairCodeModalOpen}
        instanceName={currentPairCodeInstance?.instance_name || ''}
        onSuccess={fetchInstances}
      />

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        open={showInsufficientCreditsModal}
        onOpenChange={setShowInsufficientCreditsModal}
        requiredCredits={INSTANCE_COST}
        systemName="Instância WhatsApp"
      />
    </>
  );
}
