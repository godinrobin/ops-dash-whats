import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Smartphone, MessageSquare, Users, BarChart3, Plus, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  last_seen: string | null;
}

interface Conversation {
  id: string;
  name: string;
  is_active: boolean;
  chip_a_id: string | null;
  chip_b_id: string | null;
}

interface Stats {
  totalInstances: number;
  connectedInstances: number;
  totalConversations: number;
  activeConversations: number;
  messagesToday: number;
  messagesThisWeek: number;
}

export default function MaturadorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalInstances: 0,
    connectedInstances: 0,
    totalConversations: 0,
    activeConversations: 0,
    messagesToday: 0,
    messagesThisWeek: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch instances
      const { data: instancesData, error: instancesError } = await supabase
        .from('maturador_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (instancesError) throw instancesError;
      setInstances(instancesData || []);

      // Fetch conversations
      const { data: conversationsData, error: conversationsError } = await supabase
        .from('maturador_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (conversationsError) throw conversationsError;
      setConversations(conversationsData || []);

      // Calculate stats
      const connected = (instancesData || []).filter(i => i.status === 'connected').length;
      const active = (conversationsData || []).filter(c => c.is_active).length;

      // Count messages
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { count: todayCount } = await supabase
        .from('maturador_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString());

      const { count: weekCount } = await supabase
        .from('maturador_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', weekAgo.toISOString());

      setStats({
        totalInstances: instancesData?.length || 0,
        connectedInstances: connected,
        totalConversations: conversationsData?.length || 0,
        activeConversations: active,
        messagesToday: todayCount || 0,
        messagesThisWeek: weekCount || 0,
      });

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success('Dados atualizados');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      default: return 'bg-red-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando';
      default: return 'Desconectado';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                Maturador de WhatsApp
              </h1>
              <p className="text-muted-foreground">Aqueça seus chips com conversas naturais</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Smartphone className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.connectedInstances}/{stats.totalInstances}</p>
                  <p className="text-xs text-muted-foreground">Números Conectados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Users className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.activeConversations}/{stats.totalConversations}</p>
                  <p className="text-xs text-muted-foreground">Conversas Ativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <MessageSquare className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.messagesToday}</p>
                  <p className="text-xs text-muted-foreground">Mensagens Hoje</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <BarChart3 className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.messagesThisWeek}</p>
                  <p className="text-xs text-muted-foreground">Mensagens (7 dias)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="instances" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
            <TabsTrigger value="instances">Números</TabsTrigger>
            <TabsTrigger value="conversations">Aquecedor</TabsTrigger>
            <TabsTrigger value="verified">Contatos Verificados</TabsTrigger>
          </TabsList>

          <TabsContent value="instances" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Seus Números</h2>
              <Button onClick={() => navigate('/maturador/instances')}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Número
              </Button>
            </div>

            {instances.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Nenhum número cadastrado</h3>
                  <p className="text-muted-foreground mb-4">Adicione seus chips de WhatsApp para começar a aquecê-los</p>
                  <Button onClick={() => navigate('/maturador/instances')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Número
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {instances.slice(0, 6).map((instance) => (
                  <Card key={instance.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/maturador/instances')}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{instance.label || instance.phone_number || instance.instance_name}</CardTitle>
                        <Badge variant="outline" className={`flex items-center gap-1 ${instance.status === 'connected' ? 'border-green-500 text-green-500' : ''}`}>
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(instance.status)}`} />
                          {getStatusText(instance.status)}
                        </Badge>
                      </div>
                      <CardDescription>{instance.phone_number || 'Número não conectado'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {instance.last_seen 
                          ? `Último acesso: ${new Date(instance.last_seen).toLocaleString('pt-BR')}`
                          : 'Nunca conectado'
                        }
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {instances.length > 6 && (
              <div className="text-center">
                <Button variant="outline" onClick={() => navigate('/maturador/instances')}>
                  Ver todos os {instances.length} números
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="conversations" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Conversas Configuradas</h2>
              <Button onClick={() => navigate('/maturador/conversations')} disabled={instances.length < 2}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Conversa
              </Button>
            </div>

            {conversations.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma conversa configurada</h3>
                  <p className="text-muted-foreground mb-4">
                    {instances.length < 2 
                      ? 'Você precisa de pelo menos 2 números para criar uma conversa'
                      : 'Configure conversas entre seus chips para aquecê-los'
                    }
                  </p>
                  <Button onClick={() => navigate('/maturador/conversations')} disabled={instances.length < 2}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Conversa
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {conversations.map((conv) => (
                  <Card key={conv.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/maturador/conversations')}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{conv.name}</CardTitle>
                        <Badge className={conv.is_active ? 'bg-green-500 hover:bg-green-600 text-white' : ''} variant={conv.is_active ? 'default' : 'secondary'}>
                          {conv.is_active ? 'Ativa' : 'Pausada'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Pareamento entre 2 números
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="verified" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Contatos Verificados pela Meta</h2>
              <Button onClick={() => navigate('/maturador/verified-contacts')}>
                Ver Todos
              </Button>
            </div>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Users className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-medium">Aqueça seu número com segurança</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Conversar com contatos verificados pela Meta (bancos, operadoras, empresas) 
                      aumenta a credibilidade do seu número e reduz chances de banimento.
                    </p>
                    <Button className="mt-3" onClick={() => navigate('/maturador/verified-contacts')}>
                      Acessar Contatos Verificados
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
