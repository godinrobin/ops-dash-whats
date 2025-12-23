import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Globe, Copy, Check, Loader2, Shield, Zap, Clock, 
  Eye, EyeOff, RefreshCw, Wifi
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/useSplashedToast";

interface ProxyOrder {
  id: string;
  host: string | null;
  port: string | null;
  username: string | null;
  password: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
}

interface ProxiesTabProps {
  balance: number;
  onRecharge: () => void;
  onBalanceChange: (newBalance: number) => void;
}

export function ProxiesTab({ balance, onRecharge, onBalanceChange }: ProxiesTabProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [orders, setOrders] = useState<ProxyOrder[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get price
      const { data: priceData, error: priceError } = await supabase.functions.invoke('pyproxy-purchase', {
        body: { action: 'get-price' }
      });

      if (!priceError && priceData?.success) {
        setPrice(priceData.price);
      }

      // Get orders
      const { data: ordersData, error: ordersError } = await supabase.functions.invoke('pyproxy-purchase', {
        body: { action: 'get-orders' }
      });

      if (!ordersError && ordersData?.success) {
        setOrders(ordersData.orders || []);
      }
    } catch (err) {
      console.error('Error loading proxy data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!user || !price) return;

    if (balance < price) {
      toast({
        title: "Saldo insuficiente",
        description: `Você precisa de R$ ${price.toFixed(2).replace('.', ',')} para esta compra.`,
        variant: "error"
      });
      onRecharge();
      return;
    }

    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('pyproxy-purchase', {
        body: { action: 'purchase' }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao comprar proxy');
      }

      toast({
        title: "Proxy adquirido!",
        description: "Sua proxy está pronta para uso.",
        variant: "success"
      });

      // Update balance locally
      onBalanceChange(balance - price);
      
      // Reload orders
      loadData();
    } catch (err: any) {
      console.error('Error purchasing proxy:', err);
      toast({
        title: "Erro",
        description: err.message || "Erro ao processar compra",
        variant: "error"
      });
    } finally {
      setPurchasing(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: "Copiado!",
      description: "Texto copiado para a área de transferência.",
      variant: "success"
    });
  };

  const togglePassword = (orderId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const getStatusBadge = (status: string, expiresAt: string | null) => {
    if (status === 'active' && expiresAt) {
      const isExpired = new Date(expiresAt) < new Date();
      if (isExpired) {
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Expirado</Badge>;
      }
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Ativo</Badge>;
    }
    if (status === 'suspended') {
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Suspenso</Badge>;
    }
    if (status === 'pending') {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Processando</Badge>;
    }
    return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">{status}</Badge>;
  };

  const activeOrders = orders.filter(o => o.status === 'active' && o.expires_at && new Date(o.expires_at) > new Date());

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Product Card */}
      <Card className="bg-gradient-to-br from-accent/10 via-background to-purple-500/10 border-accent/30 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Product Icon/Image */}
            <div className="flex-shrink-0 flex items-center justify-center w-full md:w-48 h-32 md:h-auto rounded-lg bg-gradient-to-br from-accent/20 to-purple-500/20 border border-accent/30">
              <Globe className="h-16 w-16 text-accent" />
            </div>

            {/* Product Info */}
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  Proxy Otimizado para WhatsApp
                </h2>
                <p className="text-muted-foreground mt-1">
                  Evolution API • Residential/ISP Rotating
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Alta Qualidade
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Entrega Instantânea
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Mensal
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Wifi className="h-3 w-3" />
                  IP Rotativo
                </Badge>
              </div>

              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ Otimizada para Evolution API e WhatsApp</li>
                <li>✓ IP residencial rotativo de alta qualidade</li>
                <li>✓ Renovação mensal automática disponível</li>
                <li>✓ Suporte técnico incluso</li>
              </ul>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div>
                  {price !== null && (
                    <p className="text-3xl font-bold text-green-500">
                      R$ {price.toFixed(2).replace('.', ',')}
                      <span className="text-sm font-normal text-muted-foreground">/mês</span>
                    </p>
                  )}
                </div>
                <Button 
                  onClick={handlePurchase}
                  disabled={purchasing || !price}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground px-8"
                >
                  {purchasing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4 mr-2" />
                      Contratar Agora
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* My Proxies */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Minhas Proxies</h3>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {orders.length === 0 ? (
          <Card className="border-dashed border-2 border-muted">
            <CardContent className="p-8 text-center">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Você ainda não tem nenhuma proxy contratada.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {orders.map((order) => (
              <Card key={order.id} className="border-accent/20">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                        <Globe className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium">Proxy WhatsApp</p>
                        <p className="text-xs text-muted-foreground">
                          Criado em {new Date(order.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.status, order.expires_at)}
                      {order.expires_at && (
                        <span className="text-xs text-muted-foreground">
                          Expira: {new Date(order.expires_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>

                  {order.status === 'active' && order.host && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Host */}
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="text-xs text-muted-foreground">Host</p>
                          <p className="font-mono text-sm">{order.host}</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyToClipboard(order.host!, `host-${order.id}`)}
                        >
                          {copiedField === `host-${order.id}` ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Port */}
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="text-xs text-muted-foreground">Porta</p>
                          <p className="font-mono text-sm">{order.port}</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyToClipboard(order.port!, `port-${order.id}`)}
                        >
                          {copiedField === `port-${order.id}` ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Username */}
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="text-xs text-muted-foreground">Usuário</p>
                          <p className="font-mono text-sm">{order.username}</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyToClipboard(order.username!, `user-${order.id}`)}
                        >
                          {copiedField === `user-${order.id}` ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Password */}
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="text-xs text-muted-foreground">Senha</p>
                          <p className="font-mono text-sm">
                            {showPasswords[order.id] ? order.password : '••••••••'}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => togglePassword(order.id)}
                          >
                            {showPasswords[order.id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyToClipboard(order.password!, `pass-${order.id}`)}
                          >
                            {copiedField === `pass-${order.id}` ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {order.status === 'pending' && (
                    <div className="mt-4 p-4 bg-yellow-500/10 rounded-lg flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />
                      <p className="text-sm text-yellow-500">
                        Sua proxy está sendo provisionada. Isso pode levar até 30 segundos.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
