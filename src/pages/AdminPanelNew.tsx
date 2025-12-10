import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Star, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type AdminOfferStatus = 'minerada' | 'ruim' | 'boa' | null;

interface UserData {
  id: string;
  email: string;
  username: string;
  ranking?: number;
}

interface NumberData {
  id: string;
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
  user_email: string;
  name: string;
  ad_library_link: string;
  admin_status: AdminOfferStatus;
}

interface RankingData {
  user_id: string;
  ranking: number;
  notes: string;
}

const AdminPanelNew = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [numbers, setNumbers] = useState<NumberData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [rankings, setRankings] = useState<Record<string, RankingData>>({});

  useEffect(() => {
    loadAllData();
  }, [user]);

  const loadAllData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-all-data");
      
      if (error) throw error;

      setUsers(data.users || []);
      setNumbers(data.numbers || []);
      setProducts(data.products || []);
      setOffers(data.offers || []);

      // Load metrics separately from the view
      const { data: metricsData, error: metricsError } = await supabase
        .from("metrics")
        .select(`
          id,
          product_id,
          product_name,
          date,
          invested,
          leads,
          pix_count,
          pix_total,
          cpl,
          conversion,
          result,
          roas,
          structure,
          products!inner(user_id)
        `)
        .order("date", { ascending: false });

      if (!metricsError && metricsData) {
        // Map user emails to metrics
        const userMap = new Map(data.users?.map((u: UserData) => [u.id, u.email]) || []);
        const metricsWithEmail = metricsData.map((m: any) => ({
          ...m,
          user_email: userMap.get(m.products?.user_id) || "Desconhecido"
        }));
        setMetrics(metricsWithEmail);
      }

      // Load rankings
      const { data: rankingsData, error: rankingsError } = await supabase
        .from("admin_user_rankings")
        .select("*");

      if (!rankingsError && rankingsData) {
        const rankingsMap: Record<string, RankingData> = {};
        rankingsData.forEach((r: any) => {
          rankingsMap[r.user_id] = r;
        });
        setRankings(rankingsMap);
      }
    } catch (err) {
      console.error("Error loading admin data:", err);
      toast.error("Erro ao carregar dados administrativos");
    } finally {
      setLoading(false);
    }
  };

  const updateUserRanking = async (userId: string, ranking: number) => {
    try {
      const existing = rankings[userId];
      
      if (existing) {
        const { error } = await supabase
          .from("admin_user_rankings")
          .update({ ranking, updated_at: new Date().toISOString(), updated_by: user?.id })
          .eq("user_id", userId);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("admin_user_rankings")
          .insert({ user_id: userId, ranking, updated_by: user?.id });
        
        if (error) throw error;
      }

      setRankings(prev => ({
        ...prev,
        [userId]: { user_id: userId, ranking, notes: existing?.notes || "" }
      }));
      
      toast.success("Ranking atualizado");
    } catch (err) {
      console.error("Error updating ranking:", err);
      toast.error("Erro ao atualizar ranking");
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
              <div className="space-y-6">
                {/* User Rankings */}
                <Card className="border-2 border-accent">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5 text-accent" />
                      Ranking de Usuários
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Usuário</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Ranking</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((u) => (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium">{u.username}</TableCell>
                              <TableCell>{u.email}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="w-20"
                                  value={rankings[u.id]?.ranking || 0}
                                  onChange={(e) => updateUserRanking(u.id, parseInt(e.target.value) || 0)}
                                  min={0}
                                  max={10}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Metrics by User */}
                <Card className="border-2 border-accent">
                  <CardHeader>
                    <CardTitle>Métricas por Usuário</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Usuário</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Investido</TableHead>
                            <TableHead>Leads</TableHead>
                            <TableHead>CPL</TableHead>
                            <TableHead>Vendas</TableHead>
                            <TableHead>Faturamento</TableHead>
                            <TableHead>ROAS</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.slice(0, 100).map((m) => (
                            <TableRow key={m.id}>
                              <TableCell>{m.user_email}</TableCell>
                              <TableCell>{m.product_name}</TableCell>
                              <TableCell>{m.date}</TableCell>
                              <TableCell>R$ {m.invested.toFixed(2)}</TableCell>
                              <TableCell>{m.leads}</TableCell>
                              <TableCell>R$ {m.cpl.toFixed(2)}</TableCell>
                              <TableCell>{m.pix_count}</TableCell>
                              <TableCell>R$ {m.pix_total.toFixed(2)}</TableCell>
                              <TableCell>{m.roas.toFixed(2)}x</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* NÚMEROS USUÁRIOS */}
            <TabsContent value="numbers">
              <Card className="border-2 border-accent">
                <CardHeader>
                  <CardTitle>Números por Usuário</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Número</TableHead>
                          <TableHead>Celular</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Operação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {numbers.map((n) => (
                          <TableRow key={n.id}>
                            <TableCell>{n.user_email}</TableCell>
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
              </Card>
            </TabsContent>

            {/* OFERTAS USUÁRIOS */}
            <TabsContent value="offers">
              <Card className="border-2 border-accent">
                <CardHeader>
                  <CardTitle>Ofertas por Usuário</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Nome da Oferta</TableHead>
                          <TableHead>Link</TableHead>
                          <TableHead>Status Admin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {offers.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell>{o.user_email}</TableCell>
                            <TableCell>{o.name}</TableCell>
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
    </>
  );
};

export default AdminPanelNew;
