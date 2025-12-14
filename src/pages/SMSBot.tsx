import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Copy, RefreshCw, Search, X, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActivityTracker } from "@/hooks/useActivityTracker";

interface Country {
  code: string;
  name: string;
  flag: string;
}

interface Service {
  code: string;
  name: string;
  priceRub: number;
  priceBrl: number;
  available: number;
}

interface Order {
  id: string;
  sms_activate_id: string;
  phone_number: string;
  service_code: string;
  service_name: string;
  country_code: string;
  price: number;
  status: string;
  sms_code: string | null;
  created_at: string;
  expires_at: string;
}

const SMSBot = () => {
  useActivityTracker("sms_bot", "SMS Bot");
  
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [balance, setBalance] = useState(0);
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [buyingService, setBuyingService] = useState<string | null>(null);
  const [pollingOrders, setPollingOrders] = useState<Set<string>>(new Set());

  // Carrega saldo do usuário
  const loadBalance = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('sms_user_wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();
    
    setBalance(data?.balance || 0);
  }, [user]);

  // Carrega países
  const loadCountries = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sms-get-services', {
        body: { action: 'getCountries' }
      });
      
      if (error) throw error;
      setCountries(data.countries || []);
      
      // Seleciona Brasil por padrão
      const brazil = data.countries?.find((c: Country) => c.code === '39');
      if (brazil) {
        setSelectedCountry(brazil);
      }
    } catch (error) {
      console.error('Error loading countries:', error);
      toast({ title: "Erro ao carregar países", variant: "destructive" });
    } finally {
      setLoadingCountries(false);
    }
  }, [toast]);

  // Carrega serviços para o país selecionado
  const loadServices = useCallback(async (countryCode: string) => {
    setLoadingServices(true);
    try {
      const { data, error } = await supabase.functions.invoke('sms-get-services', {
        body: { action: 'getServices', country: countryCode }
      });
      
      if (error) throw error;
      setServices(data.services || []);
    } catch (error) {
      console.error('Error loading services:', error);
      toast({ title: "Erro ao carregar serviços", variant: "destructive" });
    } finally {
      setLoadingServices(false);
    }
  }, [toast]);

  // Carrega pedidos do usuário
  const loadOrders = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('sms_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('Error loading orders:', error);
    } else {
      setOrders((data as Order[]) || []);
    }
    setLoadingOrders(false);
  }, [user]);

  // Compra número
  const buyNumber = async (service: Service) => {
    if (!selectedCountry) return;
    
    setBuyingService(service.code);
    try {
      const { data, error } = await supabase.functions.invoke('sms-buy-number', {
        body: {
          serviceCode: service.code,
          serviceName: service.name,
          country: selectedCountry.code
        }
      });
      
      if (error) throw error;
      
      if (data.error) {
        toast({ 
          title: data.error,
          description: data.required ? `Necessário: R$ ${data.required.toFixed(2)}` : undefined,
          variant: "destructive" 
        });
        return;
      }
      
      toast({ title: "Número adquirido com sucesso!" });
      setBalance(data.newBalance);
      loadOrders();
      
    } catch (error: any) {
      console.error('Error buying number:', error);
      toast({ title: error.message || "Erro ao comprar número", variant: "destructive" });
    } finally {
      setBuyingService(null);
    }
  };

  // Verifica status do SMS
  const checkStatus = async (order: Order) => {
    setPollingOrders(prev => new Set(prev).add(order.id));
    
    try {
      const { data, error } = await supabase.functions.invoke('sms-check-status', {
        body: {
          orderId: order.id,
          smsActivateId: order.sms_activate_id
        }
      });
      
      if (error) throw error;
      
      if (data.status === 'received' && data.smsCode) {
        toast({ title: "SMS recebido!" });
        loadOrders();
      }
    } catch (error) {
      console.error('Error checking status:', error);
    } finally {
      setPollingOrders(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  // Cancela pedido
  const cancelOrder = async (order: Order) => {
    try {
      const { data, error } = await supabase.functions.invoke('sms-cancel-order', {
        body: {
          orderId: order.id,
          smsActivateId: order.sms_activate_id
        }
      });
      
      if (error) throw error;
      
      if (data.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      
      toast({ title: `Cancelado. Reembolso: R$ ${data.refundAmount.toFixed(2)}` });
      setBalance(data.newBalance);
      loadOrders();
      
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast({ title: error.message || "Erro ao cancelar", variant: "destructive" });
    }
  };

  // Copia para clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  };

  // Efeitos
  useEffect(() => {
    loadBalance();
    loadCountries();
    loadOrders();
  }, [loadBalance, loadCountries, loadOrders]);

  useEffect(() => {
    if (selectedCountry) {
      loadServices(selectedCountry.code);
    }
  }, [selectedCountry, loadServices]);

  // Polling automático para pedidos aguardando SMS
  useEffect(() => {
    const waitingOrders = orders.filter(o => o.status === 'waiting_sms');
    if (waitingOrders.length === 0) return;
    
    const interval = setInterval(() => {
      waitingOrders.forEach(order => {
        if (!pollingOrders.has(order.id)) {
          checkStatus(order);
        }
      });
    }, 5000);
    
    return () => clearInterval(interval);
  }, [orders, pollingOrders]);

  // Filtra serviços pela busca
  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="container mx-auto max-w-6xl">
          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">📱 SMS Bot</h1>
            <p className="text-muted-foreground">
              Compre números virtuais para receber SMS
            </p>
          </header>

          {/* Saldo */}
          <Card className="mb-6 border-2 border-accent">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Seu saldo</p>
                <p className="text-2xl font-bold text-accent">R$ {balance.toFixed(2)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadBalance}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Tabs defaultValue="buy" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buy">Comprar Número</TabsTrigger>
              <TabsTrigger value="orders">
                Meus Pedidos
                {orders.filter(o => o.status === 'waiting_sms').length > 0 && (
                  <Badge className="ml-2 bg-accent" variant="secondary">
                    {orders.filter(o => o.status === 'waiting_sms').length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="buy" className="space-y-4">
              {/* Seleção de País */}
              <Card className="border-2 border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">1. Escolha o país</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingCountries ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {countries.map(country => (
                        <Button
                          key={country.code}
                          variant={selectedCountry?.code === country.code ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedCountry(country)}
                          className={selectedCountry?.code === country.code ? "bg-accent text-accent-foreground" : ""}
                        >
                          {country.flag} {country.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Serviços */}
              <Card className="border-2 border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">2. Escolha o serviço</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar serviço..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingServices ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : filteredServices.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      Nenhum serviço disponível
                    </p>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {filteredServices.map(service => (
                          <div
                            key={service.code}
                            className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-accent transition-colors"
                          >
                            <div>
                              <p className="font-medium">{service.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {service.available} disponíveis
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="bg-accent/20 text-accent">
                                R$ {service.priceBrl.toFixed(2)}
                              </Badge>
                              <Button
                                size="sm"
                                onClick={() => buyNumber(service)}
                                disabled={buyingService === service.code || balance < service.priceBrl}
                              >
                                {buyingService === service.code ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Comprar"
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders">
              <Card className="border-2 border-border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    Histórico de Pedidos
                    <Button variant="outline" size="sm" onClick={loadOrders}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingOrders ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : orders.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum pedido encontrado
                    </p>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3">
                        {orders.map(order => (
                          <div
                            key={order.id}
                            className={`p-4 rounded-lg border-2 ${
                              order.status === 'received' 
                                ? 'border-green-500/50 bg-green-500/5' 
                                : order.status === 'cancelled'
                                ? 'border-red-500/50 bg-red-500/5'
                                : 'border-accent/50 bg-accent/5'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{order.service_name}</span>
                                  {order.status === 'waiting_sms' && (
                                    <Badge variant="secondary" className="bg-accent/20">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Aguardando SMS
                                    </Badge>
                                  )}
                                  {order.status === 'received' && (
                                    <Badge variant="secondary" className="bg-green-500/20 text-green-500">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Recebido
                                    </Badge>
                                  )}
                                  {order.status === 'cancelled' && (
                                    <Badge variant="secondary" className="bg-red-500/20 text-red-500">
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Cancelado
                                    </Badge>
                                  )}
                                </div>
                                
                                <div 
                                  className="flex items-center gap-2 text-lg font-mono cursor-pointer hover:text-accent"
                                  onClick={() => copyToClipboard(order.phone_number)}
                                >
                                  +{order.phone_number}
                                  <Copy className="h-4 w-4" />
                                </div>

                                {order.sms_code && (
                                  <div 
                                    className="mt-2 p-2 bg-green-500/10 rounded border border-green-500/30 cursor-pointer hover:bg-green-500/20"
                                    onClick={() => copyToClipboard(order.sms_code!)}
                                  >
                                    <p className="text-sm text-muted-foreground">Código SMS:</p>
                                    <p className="text-xl font-bold text-green-500 flex items-center gap-2">
                                      {order.sms_code}
                                      <Copy className="h-4 w-4" />
                                    </p>
                                  </div>
                                )}

                                <p className="text-xs text-muted-foreground mt-2">
                                  {new Date(order.created_at).toLocaleString('pt-BR')}
                                  {" • "}
                                  R$ {Number(order.price).toFixed(2)}
                                </p>
                              </div>

                              {order.status === 'waiting_sms' && (
                                <div className="flex flex-col gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => checkStatus(order)}
                                    disabled={pollingOrders.has(order.id)}
                                  >
                                    {pollingOrders.has(order.id) ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => cancelOrder(order)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default SMSBot;
