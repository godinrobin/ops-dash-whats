import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Globe, Copy, Check, Loader2, Shield, Zap, Clock, 
  Eye, EyeOff, RefreshCw, RotateCcw, Minus, Plus, ChevronDown, ChevronRight, Pencil,
  Server, Wifi, Building2, PlayCircle, CheckCircle, XCircle, AlertCircle
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
  label?: string | null;
  plan_type?: string | null;
  gateway_used?: string | null;
  test_result?: string | null;
  test_ip?: string | null;
}

interface ProxyTestResult {
  gateway_valid: boolean;
  pyproxy_user_valid: boolean;
  pyproxy_has_flow: boolean;
  http_test_result: string;
  external_ip?: string;
  latency_ms?: number;
  error?: string;
  details?: {
    remaining_flow_gb?: number;
    test_command?: string;
    [key: string]: unknown;
  };
}

interface ProxiesTabProps {
  balance: number;
  onRecharge: () => void;
  onBalanceChange: (newBalance: number) => void;
}

type PlanType = 'residential' | 'isp' | 'datacenter';

const PLAN_CONFIG: Record<PlanType, { label: string; icon: React.ReactNode; description: string; color: string }> = {
  residential: {
    label: 'Residential',
    icon: <Wifi className="h-4 w-4" />,
    description: 'IPs residenciais rotativos',
    color: 'bg-green-500/20 text-green-400 border-green-500/30'
  },
  isp: {
    label: 'ISP',
    icon: <Server className="h-4 w-4" />,
    description: 'IPs de provedores de internet',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  },
  datacenter: {
    label: 'Datacenter',
    icon: <Building2 className="h-4 w-4" />,
    description: 'IPs de datacenter',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
  }
};

export function ProxiesTab({ balance, onRecharge, onBalanceChange }: ProxiesTabProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProxyTestResult>>({});
  const [orders, setOrders] = useState<ProxyOrder[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [planType, setPlanType] = useState<PlanType>('residential');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState("");

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

    const totalPrice = price * quantity;

    if (balance < totalPrice) {
      toast({
        title: "Saldo insuficiente",
        description: `Você precisa de R$ ${totalPrice.toFixed(2).replace('.', ',')} para esta compra.`,
        variant: "error"
      });
      onRecharge();
      return;
    }

    setPurchasing(true);
    try {
      // Purchase multiple proxies sequentially
      let successCount = 0;
      let lastError = '';

      for (let i = 0; i < quantity; i++) {
        const { data, error } = await supabase.functions.invoke('pyproxy-purchase', {
          body: { action: 'purchase', planType }
        });

        if (error) {
          const body = (error as any)?.context?.body;
          lastError = body?.error || body?.message || error.message;
          continue;
        }

        if (data?.success) {
          successCount++;
        } else {
          lastError = data?.error || 'Erro ao comprar proxy';
        }
      }

      if (successCount > 0) {
        toast({
          title: successCount === quantity ? "Proxies adquiridas!" : `${successCount}/${quantity} proxies adquiridas`,
          description: successCount === quantity 
            ? `${quantity} proxy(s) ${PLAN_CONFIG[planType].label} pronta(s) para uso.`
            : `Algumas compras falharam: ${lastError}`,
          variant: successCount === quantity ? "success" : "default"
        });

        // Update balance locally
        onBalanceChange(balance - (price * successCount));
        
        // Reload orders
        loadData();
      } else {
        throw new Error(lastError || 'Erro ao comprar proxies');
      }
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

  const handleRenew = async (orderId: string) => {
    if (!user || !price) return;

    if (balance < price) {
      toast({
        title: "Saldo insuficiente",
        description: `Você precisa de R$ ${price.toFixed(2).replace('.', ',')} para renovar.`,
        variant: "error"
      });
      onRecharge();
      return;
    }

    setRenewing(orderId);
    try {
      const { data, error } = await supabase.functions.invoke('pyproxy-purchase', {
        body: { action: 'renew', orderId }
      });

      if (error) {
        const body = (error as any)?.context?.body;
        const message = body?.error || body?.message || error.message;
        throw new Error(message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao renovar proxy');
      }

      toast({
        title: "Proxy renovada!",
        description: "Sua proxy foi renovada por mais 30 dias.",
        variant: "success"
      });

      // Update balance locally
      onBalanceChange(balance - price);
      
      // Reload orders
      loadData();
    } catch (err: any) {
      console.error('Error renewing proxy:', err);
      toast({
        title: "Erro",
        description: err.message || "Erro ao renovar proxy",
        variant: "error"
      });
    } finally {
      setRenewing(null);
    }
  };

  const handleTestProxy = async (orderId: string) => {
    if (!user) return;

    setTesting(orderId);
    try {
      const { data, error } = await supabase.functions.invoke('pyproxy-purchase', {
        body: { action: 'test-proxy', orderId }
      });

      if (error) {
        const body = (error as any)?.context?.body;
        const message = body?.error || body?.message || error.message;
        throw new Error(message);
      }

      if (data?.test_results) {
        setTestResults(prev => ({
          ...prev,
          [orderId]: data.test_results
        }));

        // Update local order state with test result
        setOrders(prev => prev.map(o => 
          o.id === orderId ? { 
            ...o, 
            test_result: data.test_results.http_test_result,
            test_ip: data.test_results.external_ip 
          } : o
        ));

        const success = data.test_results.gateway_valid && 
                        data.test_results.pyproxy_user_valid && 
                        data.test_results.pyproxy_has_flow;

        toast({
          title: success ? "Proxy OK!" : "Atenção",
          description: success 
            ? `Proxy funcionando. Tráfego: ${data.test_results.details?.remaining_flow_gb || '?'}GB`
            : data.test_results.error || "Verifique os detalhes do teste",
          variant: success ? "success" : "default"
        });
      } else {
        throw new Error(data?.error || 'Erro ao testar proxy');
      }
    } catch (err: any) {
      console.error('Error testing proxy:', err);
      toast({
        title: "Erro no teste",
        description: err.message || "Erro ao testar proxy",
        variant: "error"
      });
    } finally {
      setTesting(null);
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

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const startEditingLabel = (order: ProxyOrder, index: number) => {
    setEditingLabel(order.id);
    setLabelValue(order.label || `Proxy WhatsApp ${index + 1}`);
  };

  const saveLabel = async (orderId: string) => {
    try {
      // Save to database
      const { error } = await supabase
        .from('proxy_orders')
        .update({ label: labelValue })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setOrders(prev => prev.map(o => 
        o.id === orderId ? { ...o, label: labelValue } : o
      ));
      setEditingLabel(null);
      toast({
        title: "Nome atualizado!",
        variant: "success"
      });
    } catch (err) {
      console.error('Error saving label:', err);
      toast({
        title: "Erro ao salvar nome",
        variant: "error"
      });
    }
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

  const getPlanTypeBadge = (planType: string | null | undefined) => {
    const type = (planType || 'residential') as PlanType;
    const config = PLAN_CONFIG[type] || PLAN_CONFIG.residential;
    return (
      <Badge className={config.color}>
        {config.icon}
        <span className="ml-1">{config.label}</span>
      </Badge>
    );
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
                  Proxy Otimizada para WhatsApp
                </h2>
                <p className="text-muted-foreground mt-1">
                  IP de Alta Qualidade para WhatsApp
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
                  Validade 30 dias
                </Badge>
              </div>

              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ IP sem queda de alta qualidade</li>
                <li>✓ Renovação disponível</li>
                <li>✓ Reduz Bloqueio de Número</li>
                <li>✓ Protocolo HTTP/HTTPS</li>
              </ul>

              <div className="flex flex-col gap-4 pt-4 border-t border-border">
                {/* Plan Type Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Tipo de Proxy</label>
                  <Select value={planType} onValueChange={(v) => setPlanType(v as PlanType)}>
                    <SelectTrigger className="w-full md:w-64">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAN_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            {config.icon}
                            <span>{config.label}</span>
                            <span className="text-muted-foreground text-xs">- {config.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    {price !== null && (
                      <p className="text-3xl font-bold text-green-500">
                        R$ {(price * quantity).toFixed(2).replace('.', ',')}
                        <span className="text-sm font-normal text-muted-foreground">
                          {quantity > 1 ? ` (${quantity}x R$ ${price.toFixed(2).replace('.', ',')})` : '/mês'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Quantity Selector */}
                  <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1 || purchasing}
                      className="h-8 w-8 p-0"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      className="w-14 h-8 text-center bg-transparent border-0"
                    />
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setQuantity(Math.min(10, quantity + 1))}
                      disabled={quantity >= 10 || purchasing}
                      className="h-8 w-8 p-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button 
                    onClick={handlePurchase}
                    disabled={purchasing || !price}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground flex-1"
                  >
                    {purchasing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>
                        <Globe className="h-4 w-4 mr-2" />
                        Contratar {quantity > 1 ? `${quantity} Proxies` : 'Agora'}
                      </>
                    )}
                  </Button>
                </div>
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
          <div className="grid gap-3">
            {orders.map((order, index) => {
              const proxyName = order.label || `Proxy WhatsApp ${index + 1}`;
              const isExpanded = expandedOrders[order.id] ?? false;
              
              return (
                <Card key={order.id} className="border-accent/20">
                  <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(order.id)}>
                    <CardContent className="p-4">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between cursor-pointer hover:bg-muted/30 -m-4 p-4 rounded-lg transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-accent" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-accent" />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {editingLabel === order.id ? (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    value={labelValue}
                                    onChange={(e) => setLabelValue(e.target.value)}
                                    className="h-8 w-48"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveLabel(order.id);
                                      if (e.key === 'Escape') setEditingLabel(null);
                                    }}
                                  />
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => saveLabel(order.id)}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <p className="font-medium">{proxyName}</p>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingLabel(order, index);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {getPlanTypeBadge(order.plan_type)}
                            {getStatusBadge(order.status, order.expires_at)}
                            {order.expires_at && (
                              <span className="text-xs text-muted-foreground hidden sm:inline">
                                Expira: {new Date(order.expires_at).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="pt-4 mt-4 border-t border-border">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {/* Host */}
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Host</label>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
                                {order.host || '-'}
                              </code>
                              {order.host && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(order.host!, `host-${order.id}`)}
                                >
                                  {copiedField === `host-${order.id}` ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Port */}
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Porta</label>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">
                                {order.port || '-'}
                              </code>
                              {order.port && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(order.port!, `port-${order.id}`)}
                                >
                                  {copiedField === `port-${order.id}` ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Username */}
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Usuário</label>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
                                {order.username || '-'}
                              </code>
                              {order.username && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(order.username!, `user-${order.id}`)}
                                >
                                  {copiedField === `user-${order.id}` ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Password */}
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Senha</label>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">
                                {showPasswords[order.id] ? order.password : '••••••••'}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => togglePassword(order.id)}
                              >
                                {showPasswords[order.id] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              {order.password && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(order.password!, `pass-${order.id}`)}
                                >
                                  {copiedField === `pass-${order.id}` ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Gateway Info */}
                        {order.gateway_used && (
                          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Server className="h-3 w-3" />
                              <span>Gateway: {order.gateway_used}</span>
                              {order.test_result && (
                                <>
                                  <span className="mx-2">•</span>
                                  <span>Teste: {order.test_result}</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Test Results */}
                        {testResults[order.id] && (
                          <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                              <PlayCircle className="h-4 w-4" />
                              Resultado do Teste
                            </h4>
                            <div className="grid gap-2 text-sm">
                              <div className="flex items-center gap-2">
                                {testResults[order.id].gateway_valid ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                                <span>Gateway: {testResults[order.id].gateway_valid ? 'Válido' : 'Inválido'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {testResults[order.id].pyproxy_user_valid ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                                <span>Usuário PYPROXY: {testResults[order.id].pyproxy_user_valid ? 'Válido' : 'Inválido'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {testResults[order.id].pyproxy_has_flow ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                                )}
                                <span>Tráfego: {testResults[order.id].pyproxy_has_flow 
                                  ? `${testResults[order.id].details?.remaining_flow_gb || '?'}GB disponível` 
                                  : 'Sem tráfego'}</span>
                              </div>
                              {testResults[order.id].latency_ms && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Clock className="h-4 w-4" />
                                  <span>Latência: {testResults[order.id].latency_ms}ms</span>
                                </div>
                              )}
                              {testResults[order.id].error && (
                                <div className="mt-2 p-2 bg-red-500/10 rounded text-red-400 text-xs">
                                  {testResults[order.id].error}
                                </div>
                              )}
                              {testResults[order.id].details?.test_command && (
                                <div className="mt-2 space-y-1">
                                  <label className="text-xs text-muted-foreground">Comando para teste manual:</label>
                                  <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-muted px-2 py-1 rounded text-xs font-mono truncate">
                                      {testResults[order.id].details?.test_command}
                                    </code>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => copyToClipboard(
                                        testResults[order.id].details?.test_command as string,
                                        `cmd-${order.id}`
                                      )}
                                    >
                                      {copiedField === `cmd-${order.id}` ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Full Proxy String */}
                        <div className="mt-4 space-y-1">
                          <label className="text-xs text-muted-foreground">String Completa (host:port:user:pass)</label>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
                              {order.host}:{order.port}:{order.username}:{showPasswords[order.id] ? order.password : '••••'}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(
                                `${order.host}:${order.port}:${order.username}:${order.password}`,
                                `full-${order.id}`
                              )}
                            >
                              {copiedField === `full-${order.id}` ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-4 flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestProxy(order.id)}
                            disabled={testing === order.id || order.status !== 'active'}
                          >
                            {testing === order.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Testando...
                              </>
                            ) : (
                              <>
                                <PlayCircle className="h-4 w-4 mr-2" />
                                Testar Proxy
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRenew(order.id)}
                            disabled={renewing === order.id || !price}
                          >
                            {renewing === order.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Renovando...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Renovar R$ {price?.toFixed(2).replace('.', ',')}
                              </>
                            )}
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </CardContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
