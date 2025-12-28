import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { NeonButton } from "@/components/ui/neon-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AnimatedTabs, 
  AnimatedTabsList, 
  AnimatedTabsTrigger, 
  AnimatedTabsContent 
} from "@/components/ui/animated-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Wallet, RefreshCw, ShoppingCart, ExternalLink, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useSplashedToast";
import { RechargeModal } from "@/components/RechargeModal";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { AnimatedSearchBar } from "@/components/ui/animated-search-bar";

interface Service {
  id: string;
  name: string;
  nameOriginal: string;
  category: string;
  categoryPt: string;
  type: string;
  rateUsd: number;
  pricePer1000Brl: number;
  priceWithMarkup: number;
  min: number;
  max: number;
  dripfeed: boolean;
  refill: boolean;
  cancel: boolean;
  description: string;
}

interface Order {
  id: string;
  smm_raja_order_id: string | null;
  service_id: string;
  service_name: string;
  category: string;
  link: string;
  quantity: number;
  price_brl: number;
  status: string;
  start_count: number | null;
  remains: number | null;
  created_at: string;
}

const SMMPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  useActivityTracker('system_access', 'SMM Panel');

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [orderLink, setOrderLink] = useState("");
  const [orderQuantity, setOrderQuantity] = useState<number>(100);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [customComments, setCustomComments] = useState("");

  useEffect(() => {
    fetchServices();
    fetchBalance();
    fetchOrders();
  }, [user]);

  const fetchServices = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('smm-get-services', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.data?.success) {
        setServices(response.data.services);
        setCategories(response.data.categoriesPt);
      } else {
        throw new Error(response.data?.error || 'Erro ao carregar serviços');
      }
    } catch (error: any) {
      console.error('Error fetching services:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os serviços",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('sms_user_wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setBalance(data.balance);
    } else if (error?.code === 'PGRST116') {
      await supabase.from('sms_user_wallets').insert({ user_id: user.id, balance: 0 });
      setBalance(0);
    }
  };

  const fetchOrders = async () => {
    if (!user) return;
    setLoadingOrders(true);

    try {
      const { data, error } = await supabase
        .from('smm_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Check if service requires custom comments
  const requiresCustomComments = (service: Service | null) => {
    if (!service) return false;
    const name = service.nameOriginal?.toLowerCase() || service.name.toLowerCase();
    return name.includes('custom comment') || name.includes('personalizado') || name.includes('comments -');
  };

  // Validate custom comments count matches quantity
  const getCommentsCount = () => {
    if (!customComments.trim()) return 0;
    return customComments.split('\n').filter(line => line.trim()).length;
  };

  const handlePurchase = async () => {
    if (!selectedService || !orderLink || !orderQuantity) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o link e a quantidade",
        variant: "destructive",
      });
      return;
    }

    if (orderQuantity < selectedService.min || orderQuantity > selectedService.max) {
      toast({
        title: "Quantidade inválida",
        description: `Quantidade deve estar entre ${selectedService.min} e ${selectedService.max}`,
        variant: "destructive",
      });
      return;
    }

    // Validate custom comments
    if (requiresCustomComments(selectedService)) {
      const commentsCount = getCommentsCount();
      if (commentsCount !== orderQuantity) {
        toast({
          title: "Comentários inválidos",
          description: `Você precisa inserir exatamente ${orderQuantity} comentários (um por linha). Você inseriu ${commentsCount}.`,
          variant: "destructive",
        });
        return;
      }
    }

    setPurchasing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const priceUsd = (selectedService.rateUsd / 1000) * orderQuantity;
      const priceBrl = (selectedService.priceWithMarkup / 1000) * orderQuantity;

      // Build request body
      const requestBody: any = {
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        category: selectedService.category,
        link: orderLink,
        quantity: orderQuantity,
        priceUsd: priceUsd,
        priceBrl: priceBrl,
      };

      // Add custom comments if required
      if (requiresCustomComments(selectedService) && customComments.trim()) {
        requestBody.comments = customComments;
      }

      const response = await supabase.functions.invoke('smm-create-order', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: requestBody,
      });

      if (response.data?.success) {
        toast({
          title: "Pedido criado!",
          description: `Pedido #${response.data.smmOrderId} criado com sucesso`,
        });
        setBalance(response.data.newBalance);
        setSelectedService(null);
        setOrderLink("");
        setOrderQuantity(100);
        setCustomComments("");
        fetchOrders();
        
        // Redireciona para a aba de pedidos
        const ordersTab = document.querySelector('[value="orders"]') as HTMLButtonElement;
        ordersTab?.click();
      } else {
        throw new Error(response.data?.error || 'Erro ao criar pedido');
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleCheckStatus = async (order: Order) => {
    setCheckingStatus(order.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await supabase.functions.invoke('smm-check-status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          orderId: order.id,
          smmOrderId: order.smm_raja_order_id,
        },
      });

      if (response.data?.success) {
        toast({
          title: "Status atualizado",
          description: `Status: ${response.data.status}`,
        });
        fetchOrders();
      } else {
        throw new Error(response.data?.error || 'Erro ao verificar status');
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await supabase.functions.invoke('smm-cancel-order', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          orderId: order.id,
          smmOrderId: order.smm_raja_order_id,
        },
      });

      if (response.data?.success) {
        toast({
          title: "Pedido cancelado",
          description: "Pedido cancelado com sucesso",
        });
        fetchOrders();
        fetchBalance();
      } else {
        throw new Error(response.data?.error || 'Erro ao cancelar pedido');
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };


  const filteredServices = services.filter(service => {
    const matchesCategory = selectedCategory === "all" || service.categoryPt === selectedCategory;
    const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         service.categoryPt.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concluído': return 'bg-green-500/20 text-green-400';
      case 'processando': return 'bg-blue-500/20 text-blue-400';
      case 'pendente': return 'bg-yellow-500/20 text-yellow-400';
      case 'parcial': return 'bg-orange-500/20 text-orange-400';
      case 'cancelado': return 'bg-red-500/20 text-red-400';
      case 'reembolsado': return 'bg-purple-500/20 text-purple-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const calculateTotalPrice = () => {
    if (!selectedService || !orderQuantity) return 0;
    return (selectedService.priceWithMarkup / 1000) * orderQuantity;
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="container mx-auto max-w-6xl">
          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">📈 Painel Marketing</h1>
            <p className="text-muted-foreground">
              Compre seguidores, curtidas e visualizações para suas redes sociais
            </p>
          </header>

          {/* Balance Card */}
          <Card className="mb-6 border-2 border-accent">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Wallet className="w-6 h-6 text-accent" />
                <div>
                  <p className="text-sm text-muted-foreground">Saldo disponível</p>
                  <p className="text-2xl font-bold text-accent">R$ {balance.toFixed(2)}</p>
                </div>
              </div>
              <Button onClick={() => setShowRechargeModal(true)} className="bg-accent hover:bg-accent/90">
                Recarregar
              </Button>
            </CardContent>
          </Card>

          <AnimatedTabs defaultValue="services" className="w-full">
            <AnimatedTabsList className="grid w-full grid-cols-2 mb-6">
              <AnimatedTabsTrigger value="services">Serviços</AnimatedTabsTrigger>
              <AnimatedTabsTrigger value="orders">Meus Pedidos</AnimatedTabsTrigger>
            </AnimatedTabsList>

            <AnimatedTabsContent value="services">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Quick Filter Buttons */}
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCategory(selectedCategory === 'Instagram Seguidores' ? 'all' : 'Instagram Seguidores')}
                      className={selectedCategory === 'Instagram Seguidores' 
                        ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20' 
                        : 'border-accent/30 hover:border-accent/50'
                      }
                    >
                      📸 Instagram Seguidores
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCategory(selectedCategory === 'Instagram Curtidas' ? 'all' : 'Instagram Curtidas')}
                      className={selectedCategory === 'Instagram Curtidas' 
                        ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20' 
                        : 'border-accent/30 hover:border-accent/50'
                      }
                    >
                      ❤️ Instagram Curtidas
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCategory(selectedCategory === 'Facebook Comentários' ? 'all' : 'Facebook Comentários')}
                      className={selectedCategory === 'Facebook Comentários' 
                        ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20' 
                        : 'border-accent/30 hover:border-accent/50'
                      }
                    >
                      💬 Facebook Comentários
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCategory(selectedCategory === 'Facebook Curtidas de Post' ? 'all' : 'Facebook Curtidas de Post')}
                      className={selectedCategory === 'Facebook Curtidas de Post' 
                        ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20' 
                        : 'border-accent/30 hover:border-accent/50'
                      }
                    >
                      👍 Facebook Curtidas de Post
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1">
                      <AnimatedSearchBar
                        placeholder="Buscar serviço..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-full md:w-[250px]">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as categorias</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Selected Service Form */}
                  {selectedService && (
                    <Card className="border-2 border-green-500/50 bg-green-500/5">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{selectedService.name}</CardTitle>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedService(null)}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                        <Badge variant="secondary" className="w-fit">{selectedService.categoryPt}</Badge>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm text-muted-foreground">Link</label>
                          <Input
                            placeholder="Cole o link aqui (ex: https://instagram.com/seu_perfil)"
                            value={orderLink}
                            onChange={(e) => setOrderLink(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">
                            Quantidade (mín: {selectedService.min}, máx: {selectedService.max})
                          </label>
                          <Input
                            type="number"
                            min={selectedService.min}
                            max={selectedService.max}
                            value={orderQuantity}
                            onChange={(e) => setOrderQuantity(parseInt(e.target.value) || 0)}
                          />
                        </div>
                        
                        {/* Custom Comments Field */}
                        {requiresCustomComments(selectedService) && (
                          <div>
                            <label className="text-sm text-muted-foreground">
                              Comentários Personalizados ({getCommentsCount()}/{orderQuantity})
                            </label>
                            <p className="text-xs text-muted-foreground mb-2">
                              Insira exatamente {orderQuantity} comentários, um por linha
                            </p>
                            <Textarea
                              placeholder={`Comentário 1\nComentário 2\nComentário 3\n...`}
                              value={customComments}
                              onChange={(e) => setCustomComments(e.target.value)}
                              rows={6}
                              className={getCommentsCount() !== orderQuantity && customComments.trim() 
                                ? 'border-red-500' 
                                : getCommentsCount() === orderQuantity 
                                  ? 'border-green-500' 
                                  : ''
                              }
                            />
                            {customComments.trim() && getCommentsCount() !== orderQuantity && (
                              <p className="text-xs text-red-500 mt-1">
                                Você precisa de {orderQuantity} comentários. Inseridos: {getCommentsCount()}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t">
                          <div>
                            <p className="text-sm text-muted-foreground">Preço por 1000:</p>
                            <p className="font-bold">R$ {selectedService.priceWithMarkup.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Total:</p>
                            <p className="text-2xl font-bold text-green-500">
                              R$ {calculateTotalPrice().toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <Button 
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={handlePurchase}
                          disabled={purchasing}
                        >
                          {purchasing ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <ShoppingCart className="w-4 h-4 mr-2" />
                          )}
                          Comprar
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Services List */}
                  <ScrollArea className="h-[500px] border border-accent/30 rounded-lg p-3">
                    <div className="space-y-2 pr-4">
                      {filteredServices.map((service) => (
                        <Card 
                          key={service.id}
                          className={`cursor-pointer transition-all hover:border-accent ${
                            selectedService?.id === service.id ? 'border-green-500' : ''
                          }`}
                          onClick={() => {
                            setSelectedService(service);
                            setOrderQuantity(service.min);
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex-1">
                                <p className="font-medium">{service.name}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {service.categoryPt}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {service.min} - {service.max}
                                  </span>
                                </div>
                              </div>
                              <div className="text-left sm:text-right shrink-0">
                                <p className="text-lg font-bold text-accent">
                                  R$ {service.priceWithMarkup.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground">por 1000</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </AnimatedTabsContent>

            <AnimatedTabsContent value="orders">
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchOrders}
                    disabled={loadingOrders}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingOrders ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </div>

                {orders.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center">
                      <p className="text-muted-foreground">Você ainda não fez nenhum pedido</p>
                    </CardContent>
                  </Card>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3 pr-4">
                      {orders.map((order) => (
                        <Card key={order.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{order.service_name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {order.link}
                                </p>
                              </div>
                              <Badge className={getStatusColor(order.status)}>
                                {order.status}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-4">
                                <span>Qtd: {order.quantity}</span>
                                <span className="font-bold text-accent">
                                  R$ {order.price_brl.toFixed(2)}
                                </span>
                              </div>
                              <span className="text-muted-foreground">
                                {new Date(order.created_at).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            {/* Progress Display */}
                            {(order.start_count !== null || order.remains !== null) && (
                              <div className="mt-3 pt-3 border-t space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Progresso</span>
                                  <span className="font-medium">
                                    {order.remains !== null 
                                      ? `${order.quantity - order.remains} / ${order.quantity}`
                                      : `0 / ${order.quantity}`
                                    }
                                  </span>
                                </div>
                                <Progress 
                                  value={order.remains !== null 
                                    ? ((order.quantity - order.remains) / order.quantity) * 100 
                                    : 0
                                  } 
                                  className="h-2"
                                />
                                <div className="flex gap-4 text-xs text-muted-foreground">
                                  {order.start_count !== null && (
                                    <span>Início: {order.start_count}</span>
                                  )}
                                  {order.remains !== null && (
                                    <span>Restante: {order.remains}</span>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCheckStatus(order)}
                                disabled={checkingStatus === order.id}
                              >
                                {checkingStatus === order.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                <span className="ml-1">Status</span>
                              </Button>
                              {order.status === 'pendente' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-400 hover:text-red-300"
                                  onClick={() => handleCancelOrder(order)}
                                >
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Cancelar
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                              >
                                <a href={order.link} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </AnimatedTabsContent>
          </AnimatedTabs>
        </div>
      </div>

      <RechargeModal
        open={showRechargeModal}
        onOpenChange={(open) => setShowRechargeModal(open)}
        onSuccess={() => {
          fetchBalance();
          setShowRechargeModal(false);
        }}
      />
    </>
  );
};

export default SMMPanel;
