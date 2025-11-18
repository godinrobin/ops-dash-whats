import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Phone, Package, TrendingUp } from "lucide-react";

interface UserData {
  id: string;
  email: string;
  username: string;
}

interface NumberData {
  user_email: string;
  numero: string;
  celular: string;
  status: string;
  operacao: string;
}

interface ProductData {
  user_email: string;
  product_name: string;
  last_update: string;
}

interface OfferData {
  user_email: string;
  offer_name: string;
  ad_library_link: string;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [numbers, setNumbers] = useState<NumberData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-get-all-data');

      if (error) {
        console.error("Erro ao carregar dados:", error);
        return;
      }

      if (data) {
        setUsers(data.users || []);
        setNumbers(data.numbers || []);
        setProducts(data.products || []);
        setOffers(data.offers || []);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-lg text-muted-foreground">Carregando dados administrativos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">Painel Administrativo</h1>
          <p className="text-muted-foreground">Visão completa de todos os dados da plataforma</p>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="numbers" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Números
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produtos
            </TabsTrigger>
            <TabsTrigger value="offers" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Ofertas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Usuários Cadastrados</CardTitle>
                <CardDescription>Lista de todos os usuários da plataforma</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome de Usuário</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.email}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="numbers">
            <Card>
              <CardHeader>
                <CardTitle>Números Organizados</CardTitle>
                <CardDescription>Todos os números cadastrados por usuário</CardDescription>
              </CardHeader>
              <CardContent>
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
                    {numbers.map((num, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{num.user_email}</TableCell>
                        <TableCell>{num.numero}</TableCell>
                        <TableCell>{num.celular}</TableCell>
                        <TableCell>
                          <Badge variant={num.status === "Respondido" ? "default" : "secondary"}>
                            {num.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{num.operacao}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader>
                <CardTitle>Produtos de Métricas</CardTitle>
                <CardDescription>Produtos cadastrados por cada usuário</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Nome do Produto</TableHead>
                      <TableHead>Última Atualização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((prod, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{prod.user_email}</TableCell>
                        <TableCell>{prod.product_name}</TableCell>
                        <TableCell>{prod.last_update}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="offers">
            <Card>
              <CardHeader>
                <CardTitle>Ofertas Rastreadas</CardTitle>
                <CardDescription>Ofertas sendo monitoradas por usuário</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Nome da Oferta</TableHead>
                      <TableHead>Link da Biblioteca</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offers.map((offer, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{offer.user_email}</TableCell>
                        <TableCell>{offer.offer_name}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          <a 
                            href={offer.ad_library_link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {offer.ad_library_link}
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
