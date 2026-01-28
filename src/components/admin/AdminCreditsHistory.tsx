import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, RefreshCw, ArrowUpCircle, ArrowDownCircle, Coins, ShoppingCart, Zap, History } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CreditTransaction {
  id: string;
  user_id: string;
  username: string | null;
  amount: number;
  type: string;
  description: string;
  system_id: string | null;
  reference_id: string | null;
  created_at: string;
}

export const AdminCreditsHistory = () => {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select(`
          id,
          user_id,
          amount,
          type,
          description,
          system_id,
          reference_id,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Get usernames for all user_ids
      const userIds = [...new Set((data || []).map(t => t.user_id))];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.username]) ?? []);

      const transactionsWithUsernames = (data || []).map(t => ({
        ...t,
        username: profileMap.get(t.user_id) || 'Usuário desconhecido'
      }));

      setTransactions(transactionsWithUsernames);
    } catch (error) {
      console.error('Error loading credit transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = 
      t.username?.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.system_id?.toLowerCase().includes(search.toLowerCase());
    
    const matchesType = typeFilter === "all" || t.type === typeFilter;
    
    return matchesSearch && matchesType;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return <ShoppingCart className="h-4 w-4 text-green-500" />;
      case 'usage':
        return <Zap className="h-4 w-4 text-amber-500" />;
      case 'refund':
        return <ArrowUpCircle className="h-4 w-4 text-blue-500" />;
      case 'admin_adjustment':
        return <Coins className="h-4 w-4 text-purple-500" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'purchase':
        return <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30">Compra</Badge>;
      case 'usage':
        return <Badge className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/30">Uso</Badge>;
      case 'refund':
        return <Badge className="bg-blue-500/20 text-blue-500 hover:bg-blue-500/30">Reembolso</Badge>;
      case 'admin_adjustment':
        return <Badge className="bg-purple-500/20 text-purple-500 hover:bg-purple-500/30">Ajuste Admin</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  // Statistics
  const stats = {
    totalPurchases: transactions.filter(t => t.type === 'purchase').reduce((sum, t) => sum + t.amount, 0),
    totalUsage: Math.abs(transactions.filter(t => t.type === 'usage').reduce((sum, t) => sum + t.amount, 0)),
    purchaseCount: transactions.filter(t => t.type === 'purchase').length,
    usageCount: transactions.filter(t => t.type === 'usage').length,
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="p-4 text-center">
            <ArrowUpCircle className="h-6 w-6 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-500">{stats.totalPurchases.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Créditos Comprados</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4 text-center">
            <ArrowDownCircle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-amber-500">{stats.totalUsage.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Créditos Usados</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary/50">
          <CardContent className="p-4 text-center">
            <ShoppingCart className="h-6 w-6 text-accent mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats.purchaseCount}</p>
            <p className="text-xs text-muted-foreground">Total Compras</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary/50">
          <CardContent className="p-4 text-center">
            <Zap className="h-6 w-6 text-accent mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats.usageCount}</p>
            <p className="text-xs text-muted-foreground">Total Usos</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-accent" />
              Histórico de Créditos Zap
            </CardTitle>
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por usuário ou descrição..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 w-full md:w-64"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="purchase">Compras</SelectItem>
                  <SelectItem value="usage">Usos</SelectItem>
                  <SelectItem value="refund">Reembolsos</SelectItem>
                  <SelectItem value="admin_adjustment">Ajustes Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Sistema</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma transação encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(transaction.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {transaction.username}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(transaction.type)}
                          {getTypeBadge(transaction.type)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {transaction.description}
                      </TableCell>
                      <TableCell>
                        {transaction.system_id ? (
                          <Badge variant="outline" className="text-xs">
                            {transaction.system_id}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${
                        transaction.amount >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {transaction.amount >= 0 ? '+' : ''}{transaction.amount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Mostrando {filteredTransactions.length} de {transactions.length} transações
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
