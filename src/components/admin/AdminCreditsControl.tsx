import { useState, useEffect } from "react";
import { useCreditsSystem, CreditsSystemStatus } from "@/hooks/useCreditsSystem";
import { supabase } from "@/integrations/supabase/client";
import {
  FlaskConical,
  UserMinus,
  Users,
  Power,
  PowerOff,
  AlertTriangle,
  Check,
  Loader2,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const AdminCreditsControl = () => {
  const { systemStatus, activatedAt, updateStatus, refresh, loading } = useCreditsSystem();
  const [updating, setUpdating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    status: CreditsSystemStatus;
    title: string;
    description: string;
  }>({
    open: false,
    status: 'inactive',
    title: '',
    description: ''
  });
  const [stats, setStats] = useState({
    totalInstances: 0,
    extraInstances: 0,
    partialMembers: 0,
    fullMembers: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Get instance count
      const { count: instanceCount } = await supabase
        .from('maturador_instances')
        .select('*', { count: 'exact', head: true });

      // Get user counts
      const { data: profiles } = await supabase
        .from('profiles')
        .select('is_full_member');

      const fullMembers = profiles?.filter(p => p.is_full_member === true).length ?? 0;
      const partialMembers = profiles?.filter(p => p.is_full_member === false).length ?? 0;

      setStats({
        totalInstances: instanceCount ?? 0,
        extraInstances: Math.max(0, (instanceCount ?? 0) - (fullMembers * 3)),
        partialMembers,
        fullMembers
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleStatusChange = async (newStatus: CreditsSystemStatus) => {
    // Show confirmation for activation
    if (newStatus === 'active') {
      setConfirmDialog({
        open: true,
        status: newStatus,
        title: '⚠️ Ativar Sistema para Todos?',
        description: `Isso ativará o sistema de créditos para TODOS os usuários. Todas as ${stats.extraInstances} instâncias extras começarão a contagem de 3 dias para renovação. Esta ação não pode ser facilmente revertida.`
      });
      return;
    }

    await executeStatusChange(newStatus);
  };

  const executeStatusChange = async (newStatus: CreditsSystemStatus) => {
    setUpdating(true);
    try {
      const success = await updateStatus(newStatus);
      if (success) {
        toast.success(getStatusMessage(newStatus));
        await refresh();

        // If activating for all, initialize instance subscriptions
        if (newStatus === 'active') {
          await initializeInstanceSubscriptions();
        }
      } else {
        toast.error('Erro ao atualizar status');
      }
    } catch (error) {
      toast.error('Erro inesperado');
    } finally {
      setUpdating(false);
      setConfirmDialog({ ...confirmDialog, open: false });
    }
  };

  const initializeInstanceSubscriptions = async () => {
    try {
      // Get all instances grouped by user
      const { data: instances } = await supabase
        .from('maturador_instances')
        .select('id, user_id, created_at')
        .order('created_at', { ascending: true });

      if (!instances) return;

      // Group by user
      const instancesByUser: Record<string, typeof instances> = {};
      instances.forEach(inst => {
        if (!instancesByUser[inst.user_id]) {
          instancesByUser[inst.user_id] = [];
        }
        instancesByUser[inst.user_id].push(inst);
      });

      // Get full member status for all users
      const userIds = Object.keys(instancesByUser);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, is_full_member')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.is_full_member]) ?? []);

      // Create subscriptions
      const subscriptionsToInsert: Array<{
        instance_id: string;
        user_id: string;
        is_free: boolean;
        expires_at: string | null;
      }> = [];

      const expiresAt3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      for (const [userId, userInstances] of Object.entries(instancesByUser)) {
        const isFullMember = profileMap.get(userId) ?? true;
        const freeLimit = isFullMember ? 3 : 0;

        userInstances.forEach((inst, index) => {
          const isFree = index < freeLimit;
          subscriptionsToInsert.push({
            instance_id: inst.id,
            user_id: userId,
            is_free: isFree,
            expires_at: isFree ? null : expiresAt3Days
          });
        });
      }

      // Insert all subscriptions
      const { error } = await supabase
        .from('instance_subscriptions')
        .upsert(subscriptionsToInsert, { onConflict: 'instance_id' });

      if (error) {
        console.error('Error initializing subscriptions:', error);
        toast.error('Erro ao inicializar assinaturas de instâncias');
      } else {
        toast.success(`${subscriptionsToInsert.length} assinaturas de instâncias criadas`);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const getStatusMessage = (status: CreditsSystemStatus): string => {
    switch (status) {
      case 'inactive': return 'Sistema de créditos desativado';
      case 'admin_test': return 'Modo de teste ativado (apenas admins veem)';
      case 'admin_partial_simulation': return 'Simulação de membro parcial ativada';
      case 'active': return 'Sistema de créditos ativado para todos!';
    }
  };

  const getStatusBadge = () => {
    switch (systemStatus) {
      case 'inactive':
        return <Badge variant="secondary"><PowerOff className="h-3 w-3 mr-1" /> Inativo</Badge>;
      case 'admin_test':
        return <Badge variant="outline" className="border-amber-500 text-amber-500"><FlaskConical className="h-3 w-3 mr-1" /> Teste Admin</Badge>;
      case 'admin_partial_simulation':
        return <Badge variant="outline" className="border-purple-500 text-purple-500"><UserMinus className="h-3 w-3 mr-1" /> Simulando Parcial</Badge>;
      case 'active':
        return <Badge className="bg-green-500"><Check className="h-3 w-3 mr-1" /> Ativo</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Power className="h-5 w-5" />
                Controle do Sistema de Créditos
              </CardTitle>
              <CardDescription>
                Gerencie o status do sistema de créditos
              </CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-bold">{stats.fullMembers}</p>
              <p className="text-xs text-muted-foreground">Membros Completos</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-bold">{stats.partialMembers}</p>
              <p className="text-xs text-muted-foreground">Membros Parciais</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-bold">{stats.totalInstances}</p>
              <p className="text-xs text-muted-foreground">Total Instâncias</p>
            </div>
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-2xl font-bold text-amber-500">{stats.extraInstances}</p>
              <p className="text-xs text-muted-foreground">Instâncias Extras</p>
            </div>
          </div>

          {/* Activation date */}
          {activatedAt && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <Calendar className="h-4 w-4 text-green-500" />
              <span className="text-sm">
                Sistema ativado em: <strong>{new Date(activatedAt).toLocaleDateString('pt-BR')}</strong>
              </span>
            </div>
          )}

          {/* Control buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant={systemStatus === 'admin_test' ? 'default' : 'outline'}
              onClick={() => handleStatusChange('admin_test')}
              disabled={updating}
              className="h-auto py-4 flex-col gap-2"
            >
              <FlaskConical className="h-5 w-5" />
              <div className="text-center">
                <p className="font-medium">Testar Admin</p>
                <p className="text-xs text-muted-foreground">Só admins veem</p>
              </div>
            </Button>

            <Button
              variant={systemStatus === 'admin_partial_simulation' ? 'default' : 'outline'}
              onClick={() => handleStatusChange('admin_partial_simulation')}
              disabled={updating}
              className="h-auto py-4 flex-col gap-2"
            >
              <UserMinus className="h-5 w-5" />
              <div className="text-center">
                <p className="font-medium">Simular Parcial</p>
                <p className="text-xs text-muted-foreground">Ver como parcial</p>
              </div>
            </Button>

            <Button
              variant={systemStatus === 'active' ? 'default' : 'outline'}
              onClick={() => handleStatusChange('active')}
              disabled={updating}
              className="h-auto py-4 flex-col gap-2 border-green-500/50 hover:border-green-500"
            >
              <Users className="h-5 w-5" />
              <div className="text-center">
                <p className="font-medium">Ativar Todos</p>
                <p className="text-xs text-muted-foreground">Produção</p>
              </div>
            </Button>

            <Button
              variant={systemStatus === 'inactive' ? 'secondary' : 'outline'}
              onClick={() => handleStatusChange('inactive')}
              disabled={updating}
              className="h-auto py-4 flex-col gap-2"
            >
              <PowerOff className="h-5 w-5" />
              <div className="text-center">
                <p className="font-medium">Desativar</p>
                <p className="text-xs text-muted-foreground">Sistema off</p>
              </div>
            </Button>
          </div>

          {/* Warning for active status */}
          {systemStatus === 'active' && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-green-500">Sistema ativo para todos os usuários</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Todos os usuários estão sujeitos às regras de créditos. Instâncias extras estão com contagem regressiva.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {confirmDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => executeStatusChange(confirmDialog.status)}
              disabled={updating}
              className="bg-green-500 hover:bg-green-600"
            >
              {updating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ativando...
                </>
              ) : (
                'Confirmar Ativação'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
