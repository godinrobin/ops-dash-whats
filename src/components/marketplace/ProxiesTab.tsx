import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { 
  Globe, Copy, Check, Loader2, Shield, Zap, Clock, 
  Eye, EyeOff, RefreshCw, RotateCcw, Minus, Plus, ChevronDown, ChevronRight, Pencil,
  Server, Wifi, Building2, PlayCircle, CheckCircle, XCircle, AlertCircle, ChevronsUpDown, Search
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/useSplashedToast";
import { BRAZIL_STATES } from "@/data/brazilLocations";
import { cn } from "@/lib/utils";

// Use the imported states data
const BRAZIL_STATES_DATA = BRAZIL_STATES;

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
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

interface ProxyTestResult {
  gateway_valid: boolean;
  gateway_from_api?: string;
  pyproxy_user_valid: boolean;
  pyproxy_has_flow: boolean;
  pyproxy_auth_ok?: boolean;
  http_test_result: string;
  external_ip?: string;
  latency_ms?: number;
  error?: string;
  details?: {
    remaining_flow_gb?: number;
    limit_flow_gb?: number;
    used_flow_gb?: number;
    test_command?: string;
    proxy_ip?: string;
    http_latency_ms?: number;
    note?: string;
    [key: string]: unknown;
  };
}

interface ProxiesTabProps {
  balance: number;
  onRecharge: () => void;
  onBalanceChange: (newBalance: number) => void;
}

type PlanType = 'residential' | 'mobile' | 'datacenter';

const PLAN_CONFIG: Record<PlanType, { label: string; icon: React.ReactNode; description: string; color: string; price: number; badge?: string }> = {
  residential: {
    label: 'Proxy Residencial',
    icon: <Wifi className="h-4 w-4" />,
    description: 'IP residencial',
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    price: 6.50
  },
  mobile: {
    label: 'Proxy Mobile',
    icon: <Zap className="h-4 w-4" />,
    description: 'IP mobile',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    price: 14.50,
    badge: 'Novidade'
  },
  datacenter: {
    label: 'Proxy Dedicada',
    icon: <Building2 className="h-4 w-4" />,
    description: 'IP exclusivo',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    price: 50.00,
    badge: 'Mais segura'
  }
};

const COUNTRY_OPTIONS = [
  { code: 'br', label: 'Brasil', flag: '🇧🇷' },
  { code: 'us', label: 'EUA', flag: '🇺🇸' },
  { code: 'jp', label: 'Japão', flag: '🇯🇵' },
  { code: 'kr', label: 'Coreia do Sul', flag: '🇰🇷' },
  { code: 'ru', label: 'Rússia', flag: '🇷🇺' },
  { code: 'in', label: 'Índia', flag: '🇮🇳' },
  { code: 'de', label: 'Alemanha', flag: '🇩🇪' },
  { code: 'gb', label: 'Reino Unido', flag: '🇬🇧' },
];

// Use imported BRAZIL_STATES_DATA

export function ProxiesTab({ balance, onRecharge, onBalanceChange }: ProxiesTabProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProxyTestResult>>({});
  const [orders, setOrders] = useState<ProxyOrder[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, { price: number; description: string }>>({});
  const [quantity, setQuantity] = useState(1);
  const [planType, setPlanType] = useState<PlanType>('residential');
  const [country, setCountry] = useState('br');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState("");
  const [selectedState, setSelectedState] = useState('random');
  const [selectedCity, setSelectedCity] = useState('');
  const [stateOpen, setStateOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  // Memoized cities for selected state
  const availableCities = useMemo(() => {
    const state = BRAZIL_STATES_DATA.find(s => s.code === selectedState);
    return state?.cities || [];
  }, [selectedState]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get prices for all proxy types
      const { data: priceData, error: priceError } = await supabase.functions.invoke('pyproxy-purchase', {
        body: { action: 'get-price' }
      });

      if (!priceError && priceData?.success) {
        setPrice(priceData.price);
        if (priceData.prices) {
          setPrices(priceData.prices);
        }
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

  // Get current price for selected plan type
  const currentPrice = prices[planType]?.price || PLAN_CONFIG[planType].price;

  const handlePurchase = async () => {
    if (!user) return;

    const unitPrice = currentPrice;
    const totalPrice = unitPrice * quantity;

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
        const purchaseBody: any = { action: 'purchase', planType, country };
        // Add state/city for Brazil targeting
        if (country === 'br' && selectedState !== 'random') {
          purchaseBody.state = selectedState;
          if (selectedCity) {
            purchaseBody.city = selectedCity;
          }
        }
        const { data, error } = await supabase.functions.invoke('pyproxy-purchase', {
          body: purchaseBody
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
        onBalanceChange(balance - (unitPrice * successCount));
        
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
    if (!user) return;

    // Find the order to get its plan type for pricing
    const order = orders.find(o => o.id === orderId);
    const orderPlanType = (order?.plan_type as PlanType) || 'residential';
    const renewPrice = prices[orderPlanType]?.price || PLAN_CONFIG[orderPlanType]?.price || 9.99;

    if (balance < renewPrice) {
      toast({
        title: "Saldo insuficiente",
        description: `Você precisa de R$ ${renewPrice.toFixed(2).replace('.', ',')} para renovar.`,
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
      onBalanceChange(balance - renewPrice);
      
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
            ? "Proxy funcionando"
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

  const getPlanTypeBadge = (orderPlanType?: string | null) => {
    const pt = (orderPlanType as PlanType) || 'residential';
    const config = PLAN_CONFIG[pt] || PLAN_CONFIG.residential;
    return (
      <Badge className={config.color}>
        {config.icon}
        <span className="ml-1">{config.label}</span>
      </Badge>
    );
  };

  const canRenew = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    const expiry = new Date(expiresAt);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 3;
  };

  const getCountryInfo = (countryCode: string | null | undefined) => {
    const opt = COUNTRY_OPTIONS.find(c => c.code === countryCode);
    return opt || { code: 'br', label: 'Brasil', flag: '🇧🇷' };
  };

  const formatUsername = (order: ProxyOrder) => {
    if (!order.username) return '-';
    const zoneType = order.plan_type === 'isp' ? 'isp' : order.plan_type === 'datacenter' ? 'dc' : 'resi';
    const region = order.country || 'br';
    let username = `${order.username}-zone-${zoneType}-region-${region}`;
    // Add state targeting if available
    if (order.state && order.state !== 'random') {
      username += `-st-${order.state}`;
    }
    // Add city targeting if available
    if (order.city) {
      username += `-city-${order.city}`;
    }
    return username;
  };

  // Generate SOCKS5 formatted string for Automati-Zap
  const formatSocks5String = (order: ProxyOrder) => {
    if (!order.host || !order.port || !order.username || !order.password) return '';
    const username = formatUsername(order);
    return `socks5://${username}:${order.password}@${order.host}:${order.port}`;
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
                  {PLAN_CONFIG[planType].label}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {PLAN_CONFIG[planType].description}
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
                <li>✓ Protocolo SOCKS5</li>
              </ul>

              <div className="flex flex-col gap-4 pt-4 border-t border-border">
                {/* Proxy Type Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Tipo de Proxy</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(Object.keys(PLAN_CONFIG) as PlanType[]).map((type) => {
                      const config = PLAN_CONFIG[type];
                      const typePrice = prices[type]?.price || config.price;
                      const isSelected = planType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setPlanType(type)}
                          className={cn(
                            "flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left",
                            isSelected 
                              ? "border-accent bg-accent/10" 
                              : "border-border hover:border-accent/50 bg-muted/30"
                          )}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span className={cn(
                              "p-1.5 rounded-md",
                              isSelected ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                            )}>
                              {config.icon}
                            </span>
                            <span className={cn(
                              "font-medium text-sm",
                              isSelected ? "text-accent" : "text-foreground"
                            )}>
                              {config.label}
                            </span>
                            {config.badge && (
                              <Badge className="ml-auto bg-accent/20 text-accent border-accent/30 text-xs whitespace-nowrap">
                                {config.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                            {config.description}
                          </p>
                          <p className={cn(
                            "text-lg font-bold mt-2",
                            isSelected ? "text-accent" : "text-foreground"
                          )}>
                            R$ {typePrice.toFixed(2).replace('.', ',')}
                            <span className="text-xs font-normal text-muted-foreground">/mês</span>
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Country Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">País do IP</label>
                  <Select value={country} onValueChange={(val) => {
                    setCountry(val);
                    // Reset state/city when country changes
                    if (val !== 'br') {
                      setSelectedState('random');
                      setSelectedCity('');
                    }
                  }}>
                    <SelectTrigger className="w-full md:w-64">
                      <SelectValue placeholder="Selecione o país" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.code} value={opt.code}>
                          <div className="flex items-center gap-2">
                            <span>{opt.flag}</span>
                            <span>{opt.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

{/* State Selector - Only for Brazil */}
                {country === 'br' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Estado do IP (opcional)</label>
                      <Popover open={stateOpen} onOpenChange={setStateOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={stateOpen}
                            className="w-full justify-between"
                          >
                            {selectedState === 'random' 
                              ? 'Aleatório (qualquer estado)'
                              : BRAZIL_STATES_DATA.find(s => s.code === selectedState)?.label || 'Selecione o estado'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar estado..." />
                            <CommandList>
                              <CommandEmpty>Nenhum estado encontrado.</CommandEmpty>
                              <CommandGroup className="max-h-64 overflow-auto">
                                {BRAZIL_STATES_DATA.map((st) => (
                                  <CommandItem
                                    key={st.code}
                                    value={st.label}
                                    onSelect={() => {
                                      setSelectedState(st.code);
                                      setSelectedCity('');
                                      setStateOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedState === st.code ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {st.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* City Selector - Only when a state is selected */}
                    {selectedState !== 'random' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Cidade (opcional)</label>
                        <Popover open={cityOpen} onOpenChange={setCityOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={cityOpen}
                              className="w-full justify-between"
                            >
                              {selectedCity 
                                ? availableCities.find(c => c.code === selectedCity)?.label || selectedCity
                                : 'Qualquer cidade'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar cidade..." />
                              <CommandList>
                                <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
                                <CommandGroup className="max-h-64 overflow-auto">
                                  <CommandItem
                                    value="any"
                                    onSelect={() => {
                                      setSelectedCity('');
                                      setCityOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        !selectedCity ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    Qualquer cidade
                                  </CommandItem>
                                  {availableCities.map((city) => (
                                    <CommandItem
                                      key={city.code}
                                      value={city.label}
                                      onSelect={() => {
                                        setSelectedCity(city.code);
                                        setCityOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedCity === city.code ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {city.label}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold text-accent">
                      R$ {(currentPrice * quantity).toFixed(2).replace('.', ',')}
                      <span className="text-sm font-normal text-muted-foreground">
                        {quantity > 1 ? ` (${quantity}x R$ ${currentPrice.toFixed(2).replace('.', ',')})` : '/mês'}
                      </span>
                    </p>
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
                    disabled={purchasing}
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
                            <Badge variant="outline" className="text-xs">
                              {getCountryInfo(order.country).flag} {getCountryInfo(order.country).label}
                            </Badge>
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
                        {/* SOCKS5 String for Automati-Zap */}
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground font-medium text-green-400">
                            🔗 String SOCKS5 para Automati-Zap (copie e cole)
                          </label>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-green-500/10 border border-green-500/30 px-3 py-2 rounded text-sm font-mono text-green-400 truncate">
                              {formatSocks5String(order)}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-500/30 hover:bg-green-500/10"
                              onClick={() => copyToClipboard(
                                formatSocks5String(order),
                                `socks5-${order.id}`
                              )}
                            >
                              {copiedField === `socks5-${order.id}` ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Formato alternativo (host:port:user:pass)
                          </p>
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
                            disabled={renewing === order.id || !canRenew(order.expires_at)}
                            title={!canRenew(order.expires_at) ? 'Disponível quando faltar 3 dias para expirar' : ''}
                          >
                            {renewing === order.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Renovando...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Renovar R$ {(prices[(order.plan_type as PlanType)]?.price || PLAN_CONFIG[(order.plan_type as PlanType) || 'residential']?.price || 6.50).toFixed(2).replace('.', ',')}
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
