import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { 
  Smartphone, Search, RefreshCw, Loader2, MessageSquare, 
  TrendingUp, Trophy, Medal, Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InstanceData {
  id: string;
  user_id: string;
  user_email: string;
  username: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  conversation_count: number;
  last_conversation_sync: string | null;
  created_at: string;
  disconnected_at?: string | null;
}

interface AdminInstancesProps {
  users: Array<{ id: string; email: string; username: string }>;
  instances: InstanceData[];
  onRefresh: () => void;
}

export const AdminInstances = ({ users, instances, onRefresh }: AdminInstancesProps) => {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [deletingOld, setDeletingOld] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [cleaningOrphaned, setCleaningOrphaned] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [minConversations, setMinConversations] = useState<string>('');
  const [sortBy, setSortBy] = useState<'conversations' | 'recent'>('conversations');
  const [rankingPeriod, setRankingPeriod] = useState<'3' | '7' | '15' | '30'>('7');

  // All disconnected instances
  const allDisconnectedInstances = useMemo(() => {
    return instances.filter(inst => inst.status === 'disconnected');
  }, [instances]);

  // Calculate instances disconnected for more than 7 days
  const oldDisconnectedInstances = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return instances.filter(inst => {
      if (inst.status !== 'disconnected') return false;
      
      // Use disconnected_at if available, otherwise fall back to created_at
      const disconnectedDate = inst.disconnected_at 
        ? new Date(inst.disconnected_at) 
        : new Date(inst.created_at);
      
      return disconnectedDate < sevenDaysAgo;
    });
  }, [instances]);

  const syncInstanceConversations = async (instanceId: string) => {
    setSyncing(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-sync-conversations', {
        body: { instanceId },
      });

      if (error) throw error;

      toast.success(`Conversas atualizadas: ${data.count || 0}`);
      onRefresh();
    } catch (error: any) {
      console.error('Error syncing conversations:', error);
      toast.error(error.message || 'Erro ao sincronizar conversas');
    } finally {
      setSyncing(null);
    }
  };

  const syncAllConversations = async () => {
    setSyncingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-sync-conversations', {
        body: { syncAll: true },
      });

      if (error) throw error;

      toast.success(`Todas as instâncias atualizadas!`);
      onRefresh();
    } catch (error: any) {
      console.error('Error syncing all:', error);
      toast.error(error.message || 'Erro ao sincronizar todas');
    } finally {
      setSyncingAll(false);
    }
  };

  const deleteOldDisconnectedInstances = async () => {
    if (oldDisconnectedInstances.length === 0) {
      toast.info('Não há instâncias desconectadas há mais de 7 dias');
      return;
    }

    setDeletingOld(true);
    try {
      const instanceIds = oldDisconnectedInstances.map(inst => inst.id);
      
      const { error } = await supabase
        .from('maturador_instances')
        .delete()
        .in('id', instanceIds);

      if (error) throw error;

      toast.success(`${instanceIds.length} instância(s) excluída(s) com sucesso!`);
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting old instances:', error);
      toast.error(error.message || 'Erro ao excluir instâncias');
    } finally {
      setDeletingOld(false);
    }
  };

  // Delete all disconnected instances with delay to respect UAZAPI timeout
  const deleteAllDisconnectedInstances = async () => {
    if (allDisconnectedInstances.length === 0) {
      toast.info('Não há instâncias desconectadas');
      return;
    }

    setDeletingAll(true);
    setDeleteProgress({ current: 0, total: allDisconnectedInstances.length });
    
    let successCount = 0;
    let failCount = 0;
    const DELAY_MS = 500; // 500ms delay between deletions to respect UAZAPI timeout

    try {
      for (let i = 0; i < allDisconnectedInstances.length; i++) {
        const inst = allDisconnectedInstances[i];
        setDeleteProgress({ current: i + 1, total: allDisconnectedInstances.length });

        try {
          // Try to delete from UAZAPI first
          try {
            await supabase.functions.invoke('maturador-evolution', {
              body: { 
                action: 'admin-delete-instance', 
                instanceId: inst.id,
                instanceName: inst.instance_name
              },
            });
            console.log(`[deleteAll] Deleted ${inst.instance_name} from UAZAPI`);
          } catch (apiError) {
            // Ignore API errors, continue with DB deletion
            console.log(`[deleteAll] API delete failed for ${inst.instance_name}, continuing with DB delete`);
          }

          // Delete from database
          const { error } = await supabase
            .from('maturador_instances')
            .delete()
            .eq('id', inst.id);

          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error(`Error deleting instance ${inst.id}:`, err);
          failCount++;
        }

        // Add delay between deletions to respect UAZAPI rate limits
        if (i < allDisconnectedInstances.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      if (failCount === 0) {
        toast.success(`${successCount} instância(s) excluída(s) com sucesso!`);
      } else {
        toast.warning(`${successCount} excluída(s), ${failCount} falha(s)`);
      }
      
      onRefresh();
    } catch (error: any) {
      console.error('Error in bulk delete:', error);
      toast.error(error.message || 'Erro ao excluir instâncias');
    } finally {
      setDeletingAll(false);
      setDeleteProgress(null);
    }
  };

  // Cleanup orphaned instances from UAZAPI (instances deleted from DB but still in UAZAPI)
  const cleanupOrphanedInstances = async () => {
    setCleaningOrphaned(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'admin-cleanup-orphaned-instances' },
      });

      if (error) throw error;

      if (data.orphanedFound === 0) {
        toast.info('Nenhuma instância órfã encontrada na UAZAPI');
      } else if (data.status === 'started') {
        toast.success(`Limpeza iniciada: ${data.orphanedFound} instâncias órfãs serão excluídas em segundo plano`);
      } else if (data.failed === 0) {
        toast.success(`${data.deleted} instância(s) órfã(s) excluída(s) da UAZAPI!`);
      } else {
        toast.warning(`${data.deleted} excluída(s), ${data.failed} falha(s)`);
      }
      
      console.log('[Cleanup Result]', data);
    } catch (error: any) {
      console.error('Error cleaning orphaned instances:', error);
      toast.error(error.message || 'Erro ao limpar instâncias órfãs');
    } finally {
      setCleaningOrphaned(false);
    }
  };

  // Filter and sort instances
  const filteredInstances = useMemo(() => {
    const safeInstances = instances || [];
    let result = [...safeInstances];

    // Apply filters
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(inst =>
        inst.phone_number?.toLowerCase().includes(query) ||
        inst.instance_name.toLowerCase().includes(query) ||
        inst.label?.toLowerCase().includes(query) ||
        inst.user_email.toLowerCase().includes(query)
      );
    }

    if (selectedUser !== 'all') {
      result = result.filter(inst => inst.user_id === selectedUser);
    }

    if (selectedStatus !== 'all') {
      result = result.filter(inst => inst.status === selectedStatus);
    }

    if (minConversations) {
      const min = parseInt(minConversations);
      result = result.filter(inst => inst.conversation_count >= min);
    }

    // Sort
    if (sortBy === 'conversations') {
      result.sort((a, b) => b.conversation_count - a.conversation_count);
    } else {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return result;
  }, [instances, searchQuery, selectedUser, selectedStatus, minConversations, sortBy]);

  // Top instances for ranking
  const topInstances = useMemo(() => {
    return [...filteredInstances]
      .sort((a, b) => b.conversation_count - a.conversation_count)
      .slice(0, 10);
  }, [filteredInstances]);

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

  const getRankBadge = (index: number) => {
    if (index === 0) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground font-medium">#{index + 1}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Números WhatsApp ({instances.length} total)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar número, nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="connected">Conectado</SelectItem>
                <SelectItem value="disconnected">Desconectado</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Mín. conversas"
                value={minConversations}
                onChange={(e) => setMinConversations(e.target.value)}
                className="w-32"
              />
              <Button 
                variant="outline" 
                onClick={syncAllConversations}
                disabled={syncingAll}
              >
                {syncingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              
              {/* Delete all disconnected immediately */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    disabled={deletingAll || allDisconnectedInstances.length === 0}
                  >
                    {deletingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {deleteProgress && `${deleteProgress.current}/${deleteProgress.total}`}
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir TODAS ({allDisconnectedInstances.length})
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir TODAS as instâncias desconectadas?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá excluir permanentemente <strong>{allDisconnectedInstances.length}</strong> instância(s) 
                      desconectadas. A exclusão será feita com delay de 500ms entre cada uma para respeitar 
                      o timeout da UAZAPI. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteAllDisconnectedInstances}>
                      Excluir {allDisconnectedInstances.length} instância(s)
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Delete old disconnected (+7 days) */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    disabled={deletingOld || oldDisconnectedInstances.length === 0}
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    {deletingOld ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    +7d ({oldDisconnectedInstances.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir instâncias desconectadas +7 dias?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá excluir permanentemente <strong>{oldDisconnectedInstances.length}</strong> instância(s) 
                      que estão desconectadas há mais de 7 dias. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteOldDisconnectedInstances}>
                      Excluir {oldDisconnectedInstances.length} instância(s)
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Cleanup orphaned instances from UAZAPI */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    disabled={cleaningOrphaned}
                    className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
                  >
                    {cleaningOrphaned ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Limpar Órfãs UAZAPI
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar instâncias órfãs da UAZAPI?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá buscar todas as instâncias na UAZAPI que foram excluídas do banco de dados
                      mas ainda existem na API, e irá excluí-las. Use isto para corrigir instâncias que 
                      foram apagadas anteriormente sem serem removidas da UAZAPI.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={cleanupOrphanedInstances}>
                      Limpar Órfãs
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">Ordenar por:</span>
            <Button
              variant={sortBy === 'conversations' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy('conversations')}
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              Conversas
            </Button>
            <Button
              variant={sortBy === 'recent' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy('recent')}
            >
              Recentes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ranking Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Ranking de Conversas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={rankingPeriod} onValueChange={(v) => setRankingPeriod(v as any)}>
            <TabsList>
              <TabsTrigger value="3">3 dias</TabsTrigger>
              <TabsTrigger value="7">7 dias</TabsTrigger>
              <TabsTrigger value="15">15 dias</TabsTrigger>
              <TabsTrigger value="30">30 dias</TabsTrigger>
            </TabsList>
            <TabsContent value={rankingPeriod} className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {topInstances.slice(0, 3).map((inst, index) => (
                  <Card key={inst.id} className={index === 0 ? 'border-yellow-500/50 bg-yellow-500/5' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {getRankBadge(index)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{inst.phone_number || inst.instance_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{inst.user_email}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-primary">{inst.conversation_count}</p>
                          <p className="text-xs text-muted-foreground">conversas</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Instances Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Conversas</TableHead>
                <TableHead>Última Sync</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInstances.map((inst, index) => (
                <TableRow key={inst.id}>
                  <TableCell>
                    <div className="w-6 h-6 flex items-center justify-center">
                      {getRankBadge(index)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{inst.username}</p>
                      <p className="text-xs text-muted-foreground">{inst.user_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm">{inst.phone_number || '-'}</code>
                  </TableCell>
                  <TableCell>{inst.label || inst.instance_name}</TableCell>
                  <TableCell>{getStatusBadge(inst.status)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {inst.conversation_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inst.last_conversation_sync ? (
                      <span className="text-xs text-muted-foreground">
                        {new Date(inst.last_conversation_sync).toLocaleString('pt-BR')}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncInstanceConversations(inst.id)}
                      disabled={syncing === inst.id}
                    >
                      {syncing === inst.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredInstances.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma instância encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
