import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Smartphone, Search, RefreshCw, Loader2, Trash2, WifiOff, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DisconnectedInstance {
  id: string;
  user_id: string;
  user_email: string;
  username: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
}

export const AdminDisconnectedInstances = () => {
  const [instances, setInstances] = useState<DisconnectedInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstances, setSelectedInstances] = useState<Set<string>>(new Set());
  const [deletingInstance, setDeletingInstance] = useState<string | null>(null);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number } | null>(null);

  // Fetch disconnected instances - using the same logic as AdminInstances
  // which gets data from admin-get-all-data (UAZAPI as source of truth)
  const fetchInstances = async () => {
    setLoading(true);
    try {
      // Use admin-get-all-data to get instances with UAZAPI as source of truth
      const { data, error } = await supabase.functions.invoke('admin-get-all-data');

      if (error) throw error;

      // Get user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username');

      if (profilesError) throw profilesError;

      // Build user map from profiles
      const userMap = new Map<string, { email: string; username: string }>();
      for (const profile of profilesData || []) {
        userMap.set(profile.id, {
          email: profile.username || 'Sem email',
          username: profile.username || 'Sem nome',
        });
      }

      // Filter only disconnected instances from the response
      const allInstances = data?.instances || [];
      const disconnectedInstances = allInstances.filter((inst: any) => 
        inst.status === 'disconnected' || inst.status === 'close'
      );

      // Map instances with user info
      const mappedInstances: DisconnectedInstance[] = disconnectedInstances.map((inst: any) => {
        const userInfo = inst.user_id ? userMap.get(inst.user_id) : null;
        return {
          id: inst.id || `orphan-${inst.instance_name}`,
          user_id: inst.user_id || '',
          instance_name: inst.instance_name,
          phone_number: inst.phone_number,
          status: inst.status,
          created_at: inst.created_at || new Date().toISOString(),
          updated_at: inst.disconnected_at || inst.created_at || null,
          user_email: inst.user_email || userInfo?.email || 'Usuário não encontrado',
          username: inst.username || userInfo?.username || 'Sem nome',
        };
      });

      // Sort by updated_at descending
      mappedInstances.sort((a, b) => {
        const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return dateB - dateA;
      });

      setInstances(mappedInstances);
    } catch (error: any) {
      console.error('Error fetching disconnected instances:', error);
      toast.error('Erro ao carregar instâncias desconectadas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  // Setup realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-disconnected-instances')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'maturador_instances',
        },
        () => {
          fetchInstances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter instances by search
  const filteredInstances = useMemo(() => {
    if (!searchQuery.trim()) return instances;
    
    const query = searchQuery.toLowerCase();
    return instances.filter(inst =>
      inst.instance_name.toLowerCase().includes(query) ||
      inst.phone_number?.toLowerCase().includes(query) ||
      inst.user_email.toLowerCase().includes(query) ||
      inst.username.toLowerCase().includes(query)
    );
  }, [instances, searchQuery]);

  // Delete related data for an instance
  const deleteRelatedData = async (instanceId: string) => {
    // Delete from each table individually - cast to any to avoid deep type issues
    const client = supabase as any;
    try { await client.from('inbox_messages').delete().eq('instance_id', instanceId); } catch {}
    try { await client.from('inbox_flow_sessions').delete().eq('instance_id', instanceId); } catch {}
    try { await client.from('inbox_contacts').delete().eq('instance_id', instanceId); } catch {}
    try { await client.from('maturador_conversations').delete().eq('instance_id', instanceId); } catch {}
  };

  // Delete single instance with cascade
  const deleteInstance = async (instance: DisconnectedInstance) => {
    setDeletingInstance(instance.id);
    try {
      await deleteRelatedData(instance.id);

      // Try to delete from UAZAPI/Evolution API
      try {
        await supabase.functions.invoke('maturador-evolution', {
          body: { 
            action: 'admin-delete-instance', 
            instanceId: instance.id,
            instanceName: instance.instance_name
          },
        });
      } catch (apiError) {
        console.log(`API delete failed for ${instance.instance_name}, continuing with DB delete`);
      }

      // Delete instance from database
      const { error } = await supabase
        .from('maturador_instances')
        .delete()
        .eq('id', instance.id);

      if (error) throw error;

      toast.success(`Instância ${instance.instance_name} excluída com sucesso!`);
      setInstances(prev => prev.filter(i => i.id !== instance.id));
      setSelectedInstances(prev => {
        const next = new Set(prev);
        next.delete(instance.id);
        return next;
      });
    } catch (error: any) {
      console.error('Error deleting instance:', error);
      toast.error(`Erro ao excluir instância: ${error.message}`);
    } finally {
      setDeletingInstance(null);
    }
  };

  // Delete selected instances
  const deleteSelectedInstances = async () => {
    const toDelete = filteredInstances.filter(i => selectedInstances.has(i.id));
    if (toDelete.length === 0) {
      toast.info('Nenhuma instância selecionada');
      return;
    }

    setDeletingBulk(true);
    setDeleteProgress({ current: 0, total: toDelete.length });

    let deletedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < toDelete.length; i++) {
      const instance = toDelete[i];
      setDeleteProgress({ current: i + 1, total: toDelete.length });

      try {
        // Delete related data first
        await deleteRelatedData(instance.id);

        // Try to delete from API
        try {
          await supabase.functions.invoke('maturador-evolution', {
            body: { 
              action: 'admin-delete-instance', 
              instanceId: instance.id,
              instanceName: instance.instance_name
            },
          });
        } catch (apiError) {
          console.log(`API delete failed for ${instance.instance_name}`);
        }

        // Delete from database
        const { error } = await supabase
          .from('maturador_instances')
          .delete()
          .eq('id', instance.id);

        if (error) throw error;
        deletedCount++;
      } catch (err) {
        console.error(`Error deleting ${instance.instance_name}:`, err);
        failedCount++;
      }

      // Small delay between deletions
      if (i < toDelete.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    if (failedCount === 0) {
      toast.success(`${deletedCount} instância(s) excluída(s) com sucesso!`);
    } else {
      toast.warning(`${deletedCount} excluída(s), ${failedCount} falha(s)`);
    }

    setSelectedInstances(new Set());
    fetchInstances();
    setDeletingBulk(false);
    setDeleteProgress(null);
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    setSelectedInstances(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all visible
  const selectAll = () => {
    if (selectedInstances.size === filteredInstances.length) {
      setSelectedInstances(new Set());
    } else {
      setSelectedInstances(new Set(filteredInstances.map(i => i.id)));
    }
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate days disconnected
  const getDaysDisconnected = (updatedAt: string | null, createdAt: string) => {
    const date = updatedAt ? new Date(updatedAt) : new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <WifiOff className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{instances.length}</p>
                <p className="text-sm text-muted-foreground">Total Desconectadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {instances.filter(i => getDaysDisconnected(i.updated_at, i.created_at) > 7).length}
                </p>
                <p className="text-sm text-muted-foreground">+7 dias desconectadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{selectedInstances.size}</p>
                <p className="text-sm text-muted-foreground">Selecionadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <WifiOff className="h-5 w-5 text-destructive" />
                Instâncias Desconectadas
              </CardTitle>
              <CardDescription>
                Gerencie instâncias desconectadas dos usuários
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchInstances} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuário, instância ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            {selectedInstances.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deletingBulk}>
                    {deletingBulk ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {deleteProgress && `${deleteProgress.current}/${deleteProgress.total}`}
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir {selectedInstances.size} selecionada(s)
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar exclusão em massa</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir {selectedInstances.size} instância(s)?
                      Esta ação irá remover todas as mensagens, contatos e conversas associadas.
                      Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteSelectedInstances} className="bg-destructive text-destructive-foreground">
                      Excluir {selectedInstances.size} instância(s)
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {/* Table */}
          {filteredInstances.length === 0 ? (
            <div className="text-center py-12">
              <WifiOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhuma instância desconectada</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'Tente uma busca diferente' : 'Todas as instâncias estão conectadas'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedInstances.size === filteredInstances.length && filteredInstances.length > 0}
                        onCheckedChange={selectAll}
                      />
                    </TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Última atualização</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstances.map((instance) => {
                    const daysDisconnected = getDaysDisconnected(instance.updated_at, instance.created_at);
                    
                    return (
                      <TableRow key={instance.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedInstances.has(instance.id)}
                            onCheckedChange={() => toggleSelection(instance.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{instance.username}</p>
                            <p className="text-xs text-muted-foreground">{instance.user_email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {instance.instance_name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {instance.phone_number || 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(instance.updated_at || instance.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={daysDisconnected > 7 ? 'destructive' : 'secondary'}>
                            {daysDisconnected}d
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={deletingInstance === instance.id}
                              >
                                {deletingInstance === instance.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir instância</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir a instância <strong>{instance.instance_name}</strong> do usuário <strong>{instance.username}</strong>?
                                  <br /><br />
                                  Esta ação irá remover todas as mensagens, contatos e conversas associadas.
                                  Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteInstance(instance)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};