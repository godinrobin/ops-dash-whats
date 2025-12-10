import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Star, ExternalLink, ChevronDown, ChevronRight, ArrowUpDown, Filter, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type AdminOfferStatus = 'minerada' | 'ruim' | 'boa' | null;

interface UserData {
  id: string;
  email: string;
  username: string;
  totalInvested: number;
  isFavorite: boolean;
}

interface NumberData {
  id: string;
  user_id: string;
  user_email: string;
  numero: string;
  celular: string;
  status: string;
  operacao: string;
}

interface ProductData {
  id: string;
  user_id: string;
  user_email: string;
  product_name: string;
  last_update: string;
}

interface MetricData {
  id: string;
  product_id: string;
  product_name: string;
  user_id: string;
  user_email: string;
  date: string;
  invested: number;
  leads: number;
  pix_count: number;
  pix_total: number;
  cpl: number;
  conversion: number;
  result: number;
  roas: number;
  structure: string;
}

interface OfferData {
  id: string;
  name: string;
  ad_library_link: string;
  admin_status: AdminOfferStatus;
  created_at: string;
}

const AdminPanelNew = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [numbers, setNumbers] = useState<NumberData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // UI State for hierarchical navigation
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedUserNumbers, setExpandedUserNumbers] = useState<string | null>(null);
  
  // Modal state for product metrics
  const [selectedProductForMetrics, setSelectedProductForMetrics] = useState<{id: string; name: string} | null>(null);

  // Offers sorting and filtering
  const [offerSortBy, setOfferSortBy] = useState<'recent' | 'status'>('recent');
  const [offerStatusFilter, setOfferStatusFilter] = useState<string>('all');
  
  // Search
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    loadAllData();
  }, [user]);

  const loadAllData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-all-data");
      
      if (error) throw error;

      // Load favorites
      const { data: favoritesData } = await supabase
        .from("admin_favorite_users")
        .select("user_id");
      
      const favSet = new Set(favoritesData?.map(f => f.user_id) || []);
      setFavorites(favSet);

      // Load metrics from edge function data
      if (data.metrics) {
        setMetrics(data.metrics);
      }

      // Users already come with totalInvested from the API
      const usersWithFavorites = (data.users || []).map((u: any) => ({
        ...u,
        isFavorite: favSet.has(u.id)
      }));

      setUsers(usersWithFavorites);
      setNumbers(data.numbers || []);
      setProducts(data.products || []);
      setOffers(data.offers || []);
    } catch (err) {
      console.error("Error loading admin data:", err);
      toast.error("Erro ao carregar dados administrativos");
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (userId: string) => {
    try {
      if (favorites.has(userId)) {
        const { error } = await supabase
          .from("admin_favorite_users")
          .delete()
          .eq("user_id", userId);
        if (error) throw error;
        setFavorites(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isFavorite: false } : u));
      } else {
        const { error } = await supabase
          .from("admin_favorite_users")
          .insert({ user_id: userId, created_by: user?.id });
        if (error) throw error;
        setFavorites(prev => new Set(prev).add(userId));
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isFavorite: true } : u));
      }
      toast.success("Favorito atualizado");
    } catch (err) {
      console.error("Error toggling favorite:", err);
      toast.error("Erro ao atualizar favorito");
    }
  };

  const updateOfferStatus = async (offerId: string, status: AdminOfferStatus) => {
    try {
      const { error } = await supabase
        .from("tracked_offers")
        .update({ admin_status: status })
        .eq("id", offerId);

      if (error) throw error;

      setOffers(prev => prev.map(o => 
        o.id === offerId ? { ...o, admin_status: status } : o
      ));
      
      toast.success("Status atualizado");
    } catch (err) {
      console.error("Error updating offer status:", err);
      toast.error("Erro ao atualizar status");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copiado!");
  };

  const getStatusBadge = (status: AdminOfferStatus) => {
    switch (status) {
      case "boa":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Boa</Badge>;
      case "ruim":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">Ruim</Badge>;
      case "minerada":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">Minerada</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/50">Sem status</Badge>;
    }
  };

  const getUserProducts = (userId: string) => {
    // Get products from the products data, not from metrics
    return products.filter(p => p.user_id === userId).map(p => ({
      id: p.id,
      name: p.product_name
    }));
  };

  const getProductMetrics = (productId: string) => {
    return metrics.filter(m => m.product_id === productId);
  };

  const getUserNumbers = (userEmail: string) => {
    return numbers.filter(n => n.user_email === userEmail);
  };

  // Filter users by search
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const search = userSearch.toLowerCase();
    return users.filter(u => 
      u.username?.toLowerCase().includes(search) || 
      u.email?.toLowerCase().includes(search)
    );
  }, [users, userSearch]);

  // Get sorted and filtered offers
  const getSortedFilteredOffers = () => {
    let filtered = [...offers];
    
    // Filter by status
    if (offerStatusFilter !== 'all') {
      if (offerStatusFilter === 'none') {
        filtered = filtered.filter(o => !o.admin_status);
      } else {
        filtered = filtered.filter(o => o.admin_status === offerStatusFilter);
      }
    }

    // Sort
    if (offerSortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (offerSortBy === 'status') {
      const statusOrder = { boa: 1, minerada: 2, ruim: 3, null: 4 };
      filtered.sort((a, b) => (statusOrder[a.admin_status || 'null'] || 4) - (statusOrder[b.admin_status || 'null'] || 4));
    }

    return filtered;
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="h-14 md:h-16" />
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="container mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
              Painel Administrativo
            </h1>
            <p className="text-muted-foreground mt-2">
              Gerencie usuários, métricas, números e ofertas
            </p>
          </header>

          <Tabs defaultValue="metrics" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="metrics">Métricas Usuários</TabsTrigger>
              <TabsTrigger value="numbers">Números Usuários</TabsTrigger>
              <TabsTrigger value="offers">Ofertas Usuários</TabsTrigger>
            </TabsList>

            {/* MÉTRICAS USUÁRIOS */}
            <TabsContent value="metrics">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Search className="h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="max-w-md"
                  />
                  <span className="text-sm text-muted-foreground">
                    {filteredUsers.length} de {users.length} usuários
                  </span>
                </div>
                {filteredUsers.map((u) => (
                  <Card key={u.id} className="border-2 border-accent">
                    <CardHeader 
                      className="cursor-pointer hover:bg-accent/5 transition-colors"
                      onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedUser === u.id ? (
                            <ChevronDown className="h-5 w-5 text-accent" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-accent" />
                          )}
                          <div>
                            <CardTitle className="text-lg">{u.username || u.email}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                              Total investido: <span className="text-accent font-semibold">R$ {u.totalInvested.toFixed(2)}</span>
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(u.id);
                          }}
                        >
                          <Star className={`h-5 w-5 ${favorites.has(u.id) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                        </Button>
                      </div>
                    </CardHeader>
                    
                    {expandedUser === u.id && (
                      <CardContent>
                        <div className="space-y-3 pl-8">
                          {getUserProducts(u.id).map((product) => (
                            <Card 
                              key={product.id} 
                              className="border border-border cursor-pointer hover:bg-accent/5 transition-colors"
                              onClick={() => setSelectedProductForMetrics({ id: product.id, name: product.name })}
                            >
                              <CardHeader className="py-3">
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="h-4 w-4 text-accent" />
                                  <span className="font-medium">{product.name}</span>
                                  <Badge variant="outline" className="ml-auto text-xs">
                                    {getProductMetrics(product.id).length} métricas
                                  </Badge>
                                </div>
                              </CardHeader>
                            </Card>
                          ))}
                          {getUserProducts(u.id).length === 0 && (
                            <p className="text-muted-foreground text-sm">Nenhum produto cadastrado</p>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* NÚMEROS USUÁRIOS */}
            <TabsContent value="numbers">
              <div className="space-y-4">
                {users.map((u) => {
                  const userNumbers = getUserNumbers(u.email);
                  if (userNumbers.length === 0) return null;
                  
                  return (
                    <Card key={u.id} className="border-2 border-accent">
                      <CardHeader 
                        className="cursor-pointer hover:bg-accent/5 transition-colors"
                        onClick={() => setExpandedUserNumbers(expandedUserNumbers === u.id ? null : u.id)}
                      >
                        <div className="flex items-center gap-3">
                          {expandedUserNumbers === u.id ? (
                            <ChevronDown className="h-5 w-5 text-accent" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-accent" />
                          )}
                          <div>
                            <CardTitle className="text-lg">{u.username || u.email}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {userNumbers.length} número{userNumbers.length !== 1 ? 's' : ''} cadastrado{userNumbers.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      
                      {expandedUserNumbers === u.id && (
                        <CardContent>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Número</TableHead>
                                  <TableHead>Celular</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Operação</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {userNumbers.map((n) => (
                                  <TableRow key={n.id}>
                                    <TableCell>{n.numero}</TableCell>
                                    <TableCell>{n.celular}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline">{n.status}</Badge>
                                    </TableCell>
                                    <TableCell>{n.operacao}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* OFERTAS USUÁRIOS */}
            <TabsContent value="offers">
              <Card className="border-2 border-accent">
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <CardTitle>Ofertas</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Select value={offerSortBy} onValueChange={(v) => setOfferSortBy(v as 'recent' | 'status')}>
                        <SelectTrigger className="w-40">
                          <ArrowUpDown className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Ordenar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recent">Mais recentes</SelectItem>
                          <SelectItem value="status">Por status</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={offerStatusFilter} onValueChange={setOfferStatusFilter}>
                        <SelectTrigger className="w-40">
                          <Filter className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Filtrar status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="boa">Boa</SelectItem>
                          <SelectItem value="minerada">Minerada</SelectItem>
                          <SelectItem value="ruim">Ruim</SelectItem>
                          <SelectItem value="none">Sem status</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome da Oferta</TableHead>
                          <TableHead>Link</TableHead>
                          <TableHead>Status Admin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getSortedFilteredOffers().map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-medium">{o.name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => copyToClipboard(o.ad_library_link)}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => window.open(o.ad_library_link, "_blank")}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={o.admin_status || "none"}
                                onValueChange={(v) => updateOfferStatus(o.id, v === "none" ? null : v as AdminOfferStatus)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue>
                                    {getStatusBadge(o.admin_status)}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Sem status</SelectItem>
                                  <SelectItem value="minerada">Minerada</SelectItem>
                                  <SelectItem value="ruim">Ruim</SelectItem>
                                  <SelectItem value="boa">Boa</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modal de Métricas do Produto */}
      <Dialog 
        open={!!selectedProductForMetrics} 
        onOpenChange={(open) => !open && setSelectedProductForMetrics(null)}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto border-accent">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Métricas: {selectedProductForMetrics?.name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Estrutura</TableHead>
                  <TableHead>Investido</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>CPL</TableHead>
                  <TableHead>Vendas</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedProductForMetrics && getProductMetrics(selectedProductForMetrics.id).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.date}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{m.structure}</TableCell>
                    <TableCell>R$ {m.invested.toFixed(2)}</TableCell>
                    <TableCell>{m.leads}</TableCell>
                    <TableCell>R$ {m.cpl.toFixed(2)}</TableCell>
                    <TableCell>{m.pix_count}</TableCell>
                    <TableCell>R$ {m.pix_total.toFixed(2)}</TableCell>
                    <TableCell className={m.result >= 0 ? 'text-green-500' : 'text-red-500'}>
                      R$ {m.result.toFixed(2)}
                    </TableCell>
                    <TableCell>{m.roas.toFixed(2)}x</TableCell>
                  </TableRow>
                ))}
                {selectedProductForMetrics && getProductMetrics(selectedProductForMetrics.id).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Nenhuma métrica cadastrada para este produto
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminPanelNew;