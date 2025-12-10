import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Phone, Package, TrendingUp, UserPlus, Loader2, Key } from "lucide-react";
import { toast } from "sonner";

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

  // Create user state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  // Reset password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

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

  const handleCreateUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error("Digite o email do usuário");
      return;
    }

    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-create-users', {
        body: { emails: [newUserEmail.trim().toLowerCase()] }
      });

      if (error) {
        toast.error("Erro ao criar usuário: " + error.message);
        return;
      }

      if (data?.results?.[0]?.status === "exists") {
        toast.info("Usuário já existe no sistema");
      } else if (data?.results?.[0]?.status === "created") {
        toast.success("Usuário criado com sucesso! Senha padrão: 123456");
        setNewUserEmail("");
        loadAllData();
      } else if (data?.results?.[0]?.status === "error") {
        toast.error("Erro: " + data.results[0].error);
      }
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      toast.error("Erro ao criar usuário");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail.trim() || !resetPassword.trim()) {
      toast.error("Digite o email e a nova senha");
      return;
    }

    if (resetPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { email: resetEmail.trim().toLowerCase(), password: resetPassword }
      });

      if (error) {
        toast.error("Erro ao resetar senha: " + error.message);
        return;
      }

      if (data?.success) {
        toast.success(data.message || "Senha resetada com sucesso!");
        setResetEmail("");
        setResetPassword("");
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (error) {
      console.error("Erro ao resetar senha:", error);
      toast.error("Erro ao resetar senha");
    } finally {
      setResettingPassword(false);
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
          <TabsList className="grid w-full grid-cols-6">
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
            <TabsTrigger value="create-user" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Criar Usuário
            </TabsTrigger>
            <TabsTrigger value="reset-password" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Resetar Senha
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Usuários Cadastrados ({users.length})</CardTitle>
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

          <TabsContent value="create-user">
            <Card>
              <CardHeader>
                <CardTitle>Criar Novo Usuário</CardTitle>
                <CardDescription>
                  Crie um novo usuário com a senha padrão (123456)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-user-email">Email do Usuário</Label>
                  <Input
                    id="new-user-email"
                    type="email"
                    placeholder="usuario@email.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateUser()}
                  />
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Nota:</strong> O usuário será criado com a senha padrão <code className="bg-background px-1 rounded">123456</code>. 
                    O usuário poderá alterar a senha depois de fazer login.
                  </p>
                </div>
                <Button 
                  onClick={handleCreateUser} 
                  disabled={creatingUser || !newUserEmail.trim()}
                  className="w-full"
                >
                  {creatingUser ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Criar Usuário
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reset-password">
            <Card>
              <CardHeader>
                <CardTitle>Resetar Senha de Usuário</CardTitle>
                <CardDescription>
                  Defina uma nova senha para um usuário existente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email do Usuário</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="usuario@email.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-password">Nova Senha</Label>
                  <Input
                    id="reset-password"
                    type="text"
                    placeholder="Nova senha (mínimo 6 caracteres)"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                  />
                </div>
                <Button 
                  onClick={handleResetPassword} 
                  disabled={resettingPassword || !resetEmail.trim() || !resetPassword.trim()}
                  className="w-full"
                >
                  {resettingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetando...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      Resetar Senha
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}