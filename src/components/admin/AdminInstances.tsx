import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Smartphone, Search, RefreshCw, Loader2, Filter, 
  Calendar, CheckCircle, XCircle, ArrowUpDown, Download
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
  connected_at?: string | null;
}

interface AdminInstancesProps {
  users: Array<{ id: string; email: string; username: string }>;
  instances: InstanceData[];
  onRefresh: () => void;
}

export const AdminInstances = ({ users, instances, onRefresh }: AdminInstancesProps) => {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('connected');
  const [sortBy, setSortBy] = useState<'days_connected' | 'days_month' | 'user' | 'recent'>('days_connected');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Selection for bulk actions
  const [selectedInstances, setSelectedInstances] = useState<Set<string>>(new Set());

  // Only connected instances for this view
  const connectedInstances = useMemo(() => {
    return instances.filter(inst => inst.status === 'connected' || inst.status === 'open');
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

  // Calculate days connected (since connected_at or created_at)
  const calculateDaysConnected = (instance: InstanceData): number => {
    if (instance.status !== 'connected' && instance.status !== 'open') return 0;
    
    const connectedDate = instance.connected_at 
      ? new Date(instance.connected_at) 
      : new Date(instance.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - connectedDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Calculate days active in current month (resets every month)
  const calculateDaysActiveThisMonth = (instance: InstanceData): number => {
    if (instance.status !== 'connected' && instance.status !== 'open') return 0;
    
    const connectedDate = instance.connected_at 
      ? new Date(instance.connected_at) 
      : new Date(instance.created_at);
    const now = new Date();
    
    // Get the first day of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // If connected before this month, count from start of month
    // If connected this month, count from connection date
    const countFrom = connectedDate > startOfMonth ? connectedDate : startOfMonth;
    
    const diffTime = now.getTime() - countFrom.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include today
    
    return Math.max(0, diffDays);
  };

  // Filter and sort instances
  const filteredInstances = useMemo(() => {
    let result: InstanceData[];
    
    if (selectedStatus === 'connected') {
      // Include both 'connected' and 'open' status
      result = instances.filter(inst => inst.status === 'connected' || inst.status === 'open');
    } else if (selectedStatus === 'disconnected') {
      // Include both 'disconnected' and 'close' status
      result = instances.filter(inst => inst.status === 'disconnected' || inst.status === 'close');
    } else if (selectedStatus === 'all') {
      result = instances;
    } else {
      result = instances.filter(inst => inst.status === selectedStatus);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(inst =>
        inst.phone_number?.toLowerCase().includes(query) ||
        inst.instance_name.toLowerCase().includes(query) ||
        inst.label?.toLowerCase().includes(query) ||
        inst.user_email.toLowerCase().includes(query) ||
        inst.username.toLowerCase().includes(query)
      );
    }

    // Apply user filter
    if (selectedUser !== 'all') {
      result = result.filter(inst => inst.user_id === selectedUser);
    }

    // Sort
    const sortedResult = [...result].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'days_connected':
          comparison = calculateDaysConnected(b) - calculateDaysConnected(a);
          break;
        case 'days_month':
          comparison = calculateDaysActiveThisMonth(b) - calculateDaysActiveThisMonth(a);
          break;
        case 'user':
          comparison = a.username.localeCompare(b.username);
          break;
        case 'recent':
          comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          break;
      }
      
      return sortOrder === 'desc' ? comparison : -comparison;
    });

    return sortedResult;
  }, [instances, searchQuery, selectedUser, selectedStatus, sortBy, sortOrder]);

  // Stats
  const stats = useMemo(() => {
    const connected = instances.filter(i => i.status === 'connected' || i.status === 'open').length;
    const disconnected = instances.filter(i => i.status === 'disconnected' || i.status === 'close').length;
    const totalDaysConnected = connectedInstances.reduce((acc, inst) => acc + calculateDaysConnected(inst), 0);
    const avgDaysConnected = connectedInstances.length > 0 
      ? Math.round(totalDaysConnected / connectedInstances.length) 
      : 0;
    
    return { connected, disconnected, avgDaysConnected };
  }, [instances, connectedInstances]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
      case 'open':
        return <Badge className="bg-green-500/20 text-green-500"><CheckCircle className="h-3 w-3 mr-1" />Conectado</Badge>;
      case 'disconnected':
      case 'close':
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Desconectado</Badge>;
      case 'connecting':
        return <Badge className="bg-yellow-500/20 text-yellow-500">Conectando</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInstances(new Set(filteredInstances.map(i => i.id)));
    } else {
      setSelectedInstances(new Set());
    }
  };

  const handleSelectInstance = (instanceId: string, checked: boolean) => {
    const newSelected = new Set(selectedInstances);
    if (checked) {
      newSelected.add(instanceId);
    } else {
      newSelected.delete(instanceId);
    }
    setSelectedInstances(newSelected);
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Export selected instances to CSV
  const exportToCSV = () => {
    const dataToExport = selectedInstances.size > 0 
      ? filteredInstances.filter(i => selectedInstances.has(i.id))
      : filteredInstances;
    
    if (dataToExport.length === 0) {
      toast.error('Nenhuma instância para exportar');
      return;
    }

    const headers = ['Usuário', 'Email', 'Instância', 'Número', 'Status', 'Dias Conectado', 'Dias Ativa Mês'];
    const rows = dataToExport.map(inst => [
      inst.username,
      inst.user_email,
      inst.instance_name,
      inst.phone_number || '-',
      inst.status,
      calculateDaysConnected(inst),
      calculateDaysActiveThisMonth(inst)
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `instancias_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast.success(`${dataToExport.length} instância(s) exportada(s)`);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.connected}</p>
                <p className="text-xs text-muted-foreground">Instâncias Conectadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.disconnected}</p>
                <p className="text-xs text-muted-foreground">Instâncias Desconectadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.avgDaysConnected}</p>
                <p className="text-xs text-muted-foreground">Média Dias Conectado</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Controle de Instâncias ({instances.length} total)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário, número, instância..."
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
                  <SelectItem key={u.id} value={u.id}>
                    {u.username || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="connected">Conectadas</SelectItem>
                <SelectItem value="disconnected">Desconectadas</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={syncAllConversations}
                disabled={syncingAll}
                className="flex-1"
              >
                {syncingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Todas
              </Button>
              
              <Button 
                variant="outline" 
                onClick={exportToCSV}
                title="Exportar CSV"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Selected count and bulk actions */}
          {selectedInstances.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg mb-4">
              <span className="text-sm font-medium">
                {selectedInstances.size} instância(s) selecionada(s)
              </span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedInstances(new Set())}
              >
                Limpar seleção
              </Button>
            </div>
          )}

          {/* Sort options */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Filter className="h-4 w-4" />
              Ordenar por:
            </span>
            <Button
              variant={sortBy === 'days_connected' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleSort('days_connected')}
            >
              <Calendar className="h-4 w-4 mr-1" />
              Dias Conectado
              {sortBy === 'days_connected' && (
                <ArrowUpDown className="h-3 w-3 ml-1" />
              )}
            </Button>
            <Button
              variant={sortBy === 'days_month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleSort('days_month')}
            >
              Dias no Mês
              {sortBy === 'days_month' && (
                <ArrowUpDown className="h-3 w-3 ml-1" />
              )}
            </Button>
            <Button
              variant={sortBy === 'user' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleSort('user')}
            >
              Usuário
              {sortBy === 'user' && (
                <ArrowUpDown className="h-3 w-3 ml-1" />
              )}
            </Button>
            <Button
              variant={sortBy === 'recent' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleSort('recent')}
            >
              Recentes
              {sortBy === 'recent' && (
                <ArrowUpDown className="h-3 w-3 ml-1" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instances Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedInstances.size === filteredInstances.length && filteredInstances.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Nome do Usuário</TableHead>
                <TableHead>Instância</TableHead>
                <TableHead>Número Conectado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Dias Conectado</TableHead>
                <TableHead className="text-center">Dias Ativa no Mês</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInstances.map((inst) => {
                const daysConnected = calculateDaysConnected(inst);
                const daysThisMonth = calculateDaysActiveThisMonth(inst);
                
                return (
                  <TableRow key={inst.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedInstances.has(inst.id)}
                        onCheckedChange={(checked) => handleSelectInstance(inst.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{inst.username}</p>
                        <p className="text-xs text-muted-foreground">{inst.user_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {inst.label || inst.instance_name}
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm font-mono">
                        {inst.phone_number || '-'}
                      </code>
                    </TableCell>
                    <TableCell>{getStatusBadge(inst.status)}</TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className={daysConnected > 7 ? 'border-green-500/50 text-green-600' : ''}
                      >
                        {daysConnected} dias
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline"
                        className={daysThisMonth > 15 ? 'border-blue-500/50 text-blue-600' : ''}
                      >
                        {daysThisMonth} dias
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncInstanceConversations(inst.id)}
                        disabled={syncing === inst.id}
                        title="Sincronizar conversas"
                      >
                        {syncing === inst.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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
