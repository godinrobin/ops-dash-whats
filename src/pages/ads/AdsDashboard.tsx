import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  MousePointerClick, 
  Eye, 
  Target,
  Users,
  ShoppingCart,
  RefreshCcw,
  AlertCircle,
  Info,
  MessageCircle,
  Settings2,
  GripVertical,
  EyeOff,
  Plus,
  X,
  ChevronDown
} from "lucide-react";
import { motion, Reorder } from "framer-motion";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface MetricCard {
  id: string;
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  visible: boolean;
}

interface FunnelStep {
  label: string;
  value: number;
  percentage: number;
}

type DateFilter = "today" | "yesterday" | "7days" | "30days";

const defaultCardOrder = [
  'spend', 'impressions', 'clicks', 'conversions',
  'cpm', 'ctr', 'cpc', 'roas',
  'conversations', 'cost_per_conversation'
];

export default function AdsDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(["all"]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('ads_dashboard_card_order');
    return saved ? JSON.parse(saved) : defaultCardOrder;
  });
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('ads_dashboard_hidden_cards');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [metrics, setMetrics] = useState({
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    cpm: 0,
    ctr: 0,
    cpc: 0,
    roas: 0,
    revenue: 0,
    profit: 0,
    totalMessages: 0,
    totalPurchases: 0,
    conversionValue: 0,
    costPerConversation: 0
  });
  const [hasAccounts, setHasAccounts] = useState(false);

  // Only show active ad accounts
  const activeAdAccounts = adAccounts.filter(acc => acc.is_selected === true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, dateFilter, selectedAccounts]);

  // Save card order to localStorage
  useEffect(() => {
    localStorage.setItem('ads_dashboard_card_order', JSON.stringify(cardOrder));
  }, [cardOrder]);

  // Save hidden cards to localStorage
  useEffect(() => {
    localStorage.setItem('ads_dashboard_hidden_cards', JSON.stringify([...hiddenCards]));
  }, [hiddenCards]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Check if user has connected accounts
      const { data: accounts } = await supabase
        .from("ads_ad_accounts")
        .select("*, ads_facebook_accounts(*)")
        .eq("user_id", user.id);

      setAdAccounts(accounts || []);
      setHasAccounts((accounts?.length || 0) > 0);

      if (!accounts?.length) {
        setLoading(false);
        return;
      }

      // Get campaigns data - only from active accounts
      const activeAccountIds = accounts.filter(a => a.is_selected).map(a => a.id);
      
      let query = supabase
        .from("ads_campaigns")
        .select("*")
        .eq("user_id", user.id);

      // Filter by selected accounts
      const hasAllSelected = selectedAccounts.includes("all");
      if (!hasAllSelected && selectedAccounts.length > 0) {
        query = query.in("ad_account_id", selectedAccounts);
      } else if (hasAllSelected && activeAccountIds.length > 0) {
        query = query.in("ad_account_id", activeAccountIds);
      }

      const { data: campaigns } = await query;

      // Calculate metrics - use meta_conversions for conversions
      const totalSpend = campaigns?.reduce((sum, c) => sum + (c.spend || 0), 0) || 0;
      const totalImpressions = campaigns?.reduce((sum, c) => sum + (c.impressions || 0), 0) || 0;
      const totalClicks = campaigns?.reduce((sum, c) => sum + (c.clicks || 0), 0) || 0;
      const totalConversions = campaigns?.reduce((sum, c) => sum + ((c as any).meta_conversions || 0), 0) || 0;
      const totalConversionValue = campaigns?.reduce((sum, c) => sum + ((c as any).conversion_value || 0), 0) || 0;
      const totalMessaging = campaigns?.reduce((sum, c) => sum + ((c as any).messaging_conversations_started || 0), 0) || 0;
      const costPerConversation = totalMessaging > 0 ? totalSpend / totalMessaging : 0;

      // Get last synced time
      if (campaigns && campaigns.length > 0) {
        const mostRecent = campaigns.reduce((latest, c) => {
          if (!c.last_synced_at) return latest;
          if (!latest) return c.last_synced_at;
          return new Date(c.last_synced_at) > new Date(latest) ? c.last_synced_at : latest;
        }, null as string | null);
        setLastSyncedAt(mostRecent);
      }

      // Get leads data for funnel
      const { data: leads } = await supabase
        .from("ads_whatsapp_leads")
        .select("*")
        .eq("user_id", user.id);

      const totalMessages = leads?.length || 0;
      const totalPurchases = leads?.filter(l => l.purchase_sent_at)?.length || 0;
      const totalRevenue = leads?.reduce((sum, l) => sum + (l.purchase_value || 0), 0) || 0;

      setMetrics({
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
        revenue: totalConversionValue,
        profit: totalConversionValue - totalSpend,
        totalMessages: totalMessaging,
        totalPurchases: totalConversions,
        conversionValue: totalConversionValue,
        costPerConversation
      });
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const datePresetMap: Record<DateFilter, string> = {
    today: "today",
    yesterday: "yesterday",
    "7days": "last_7d",
    "30days": "last_30d"
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error, data } = await supabase.functions.invoke("facebook-campaigns", { 
        body: { 
          action: "sync_campaigns",
          datePreset: datePresetMap[dateFilter]
        } 
      });
      
      // Check for auth errors
      if (error || data?.error === "Unauthorized") {
        if (data?.error === "Unauthorized" || String(error).includes("401")) {
          splashedToast.error("Sessão expirada. Recarregue a página.");
          return;
        }
        throw error;
      }
      
      splashedToast.success("Dados sincronizados com sucesso!");
      await loadData();
    } catch (error) {
      console.error("Sync error:", error);
      splashedToast.error("Erro ao sincronizar dados");
    } finally {
      setSyncing(false);
    }
  };

  // Re-sync when date filter changes
  useEffect(() => {
    if (user && !loading && hasAccounts) {
      handleSync();
    }
  }, [dateFilter]);

  const toggleCardVisibility = (cardId: string) => {
    setHiddenCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const resetLayout = () => {
    setCardOrder(defaultCardOrder);
    setHiddenCards(new Set());
    localStorage.removeItem('ads_dashboard_card_order');
    localStorage.removeItem('ads_dashboard_hidden_cards');
  };

  const allMetricCards: Record<string, MetricCard> = {
    spend: { id: 'spend', title: "Investido", value: `R$ ${metrics.spend.toFixed(2)}`, icon: DollarSign, color: "text-red-400", visible: true },
    impressions: { id: 'impressions', title: "Impressões", value: metrics.impressions.toLocaleString("pt-BR"), icon: Eye, color: "text-blue-400", visible: true },
    clicks: { id: 'clicks', title: "Cliques", value: metrics.clicks.toLocaleString("pt-BR"), icon: MousePointerClick, color: "text-purple-400", visible: true },
    conversions: { id: 'conversions', title: "Conversões", value: metrics.conversions.toString(), icon: Target, color: "text-green-400", visible: true },
    cpm: { id: 'cpm', title: "CPM", value: `R$ ${metrics.cpm.toFixed(2)}`, icon: TrendingUp, color: "text-orange-400", visible: true },
    ctr: { id: 'ctr', title: "CTR", value: `${metrics.ctr.toFixed(2)}%`, icon: TrendingUp, color: "text-cyan-400", visible: true },
    cpc: { id: 'cpc', title: "CPC", value: `R$ ${metrics.cpc.toFixed(2)}`, icon: DollarSign, color: "text-yellow-400", visible: true },
    roas: { id: 'roas', title: "ROAS", value: `${metrics.roas.toFixed(2)}x`, icon: TrendingUp, color: "text-emerald-400", visible: true },
    conversations: { id: 'conversations', title: "Conversas", value: metrics.totalMessages.toLocaleString("pt-BR"), icon: MessageCircle, color: "text-pink-400", visible: true },
    cost_per_conversation: { id: 'cost_per_conversation', title: "Custo/Conversa", value: `R$ ${metrics.costPerConversation.toFixed(2)}`, icon: MessageCircle, color: "text-indigo-400", visible: true },
  };

  const visibleCards = cardOrder
    .filter(id => !hiddenCards.has(id) && allMetricCards[id])
    .map(id => allMetricCards[id]);

  const resultCards: MetricCard[] = [
    { id: 'revenue', title: "Receita (Conversões)", value: `R$ ${metrics.conversionValue.toFixed(2)}`, icon: DollarSign, color: "text-green-400", visible: true },
    { 
      id: 'profit',
      title: "Lucro", 
      value: `R$ ${metrics.profit.toFixed(2)}`, 
      icon: metrics.profit >= 0 ? TrendingUp : TrendingDown, 
      color: metrics.profit >= 0 ? "text-green-400" : "text-red-400",
      visible: true
    },
  ];

  // Funnel data for Meta Ads (using campaign data) - only conversations and purchases
  const funnelSteps: FunnelStep[] = [
    { 
      label: "Conversas", 
      value: metrics.totalMessages, 
      percentage: metrics.totalMessages > 0 ? 100 : 0,
    },
    { 
      label: "Compras", 
      value: metrics.totalPurchases, 
      percentage: metrics.totalMessages > 0 ? (metrics.totalPurchases / metrics.totalMessages) * 100 : 0,
    },
  ];

  // Calculate max value for funnel scaling
  const maxFunnelValue = Math.max(...funnelSteps.map(s => s.value), 1);

  if (!hasAccounts && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Nenhuma conta conectada</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          Para ver seus dados de anúncios, conecte sua conta do Facebook nas configurações.
        </p>
        <Button onClick={() => navigate("/ads/settings")}>
          Ir para Configurações
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral das suas campanhas</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-between">
                {selectedAccounts.includes("all") 
                  ? "Todas as contas" 
                  : selectedAccounts.length === 1 
                    ? activeAdAccounts.find(a => a.id === selectedAccounts[0])?.name || "1 conta"
                    : `${selectedAccounts.length} contas`
                }
                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2" align="start">
              <div className="space-y-1">
                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer">
                  <Checkbox
                    checked={selectedAccounts.includes("all")}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedAccounts(["all"]);
                      }
                    }}
                  />
                  <span className="text-sm font-medium">Todas as contas</span>
                </label>
                <div className="h-px bg-border my-1" />
                {activeAdAccounts.map((acc) => (
                  <label 
                    key={acc.id} 
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={!selectedAccounts.includes("all") && selectedAccounts.includes(acc.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedAccounts(prev => {
                            const filtered = prev.filter(id => id !== "all");
                            return [...filtered, acc.id];
                          });
                        } else {
                          setSelectedAccounts(prev => {
                            const filtered = prev.filter(id => id !== acc.id);
                            return filtered.length === 0 ? ["all"] : filtered;
                          });
                        }
                      }}
                    />
                    <span className="text-sm">{acc.name || acc.ad_account_id}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="7days">7 dias</SelectItem>
              <SelectItem value="30days">30 dias</SelectItem>
            </SelectContent>
          </Select>

          {/* Edit layout button */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Personalizar Dashboard</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">
                  Escolha quais métricas exibir no dashboard
                </p>
                <div className="space-y-3">
                  {Object.entries(allMetricCards).map(([id, card]) => (
                    <div key={id} className="flex items-center justify-between">
                      <Label htmlFor={`card-${id}`} className="flex items-center gap-2">
                        <card.icon className={cn("h-4 w-4", card.color)} />
                        {card.title}
                      </Label>
                      <Switch
                        id={`card-${id}`}
                        checked={!hiddenCards.has(id)}
                        onCheckedChange={() => toggleCardVisibility(id)}
                      />
                    </div>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  className="w-full mt-4"
                  onClick={resetLayout}
                >
                  Restaurar Padrão
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex flex-col items-center">
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCcw className={cn("h-4 w-4", syncing && "animate-spin")} />
            </Button>
            {lastSyncedAt && (
              <span className="text-[10px] text-muted-foreground mt-1">
                {format(new Date(lastSyncedAt), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <Reorder.Group 
        axis="x" 
        values={cardOrder} 
        onReorder={setCardOrder}
        className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4"
      >
        {visibleCards.map((card, index) => (
          <Reorder.Item
            key={card.id}
            value={card.id}
            className="cursor-grab active:cursor-grabbing"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="bg-card/50 backdrop-blur border-border/50 relative group">
                <CardContent className="p-4">
                  {loading ? (
                    <Skeleton className="h-16" />
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">{card.title}</span>
                        <card.icon className={cn("h-4 w-4", card.color)} />
                      </div>
                      <p className="text-xl md:text-2xl font-bold">{card.value}</p>
                    </>
                  )}
                </CardContent>
                {/* Drag handle indicator */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-50 transition-opacity">
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                </div>
              </Card>
            </motion.div>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {/* Results Row */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {resultCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + index * 0.05 }}
          >
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4 md:p-6">
                {loading ? (
                  <Skeleton className="h-20" />
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">{card.title}</span>
                      <card.icon className={cn("h-5 w-5", card.color)} />
                    </div>
                    <p className="text-2xl md:text-3xl font-bold">{card.value}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Conversion Funnel - Meta Ads Style */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Funil de Conversão (Meta Ads)
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">Visualização do funil de conversão baseado nos dados das suas campanhas</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="relative">
              {/* Funnel visualization */}
              <div className="flex items-end justify-center gap-1 h-64">
                {funnelSteps.map((step, index) => {
                  const height = step.value > 0 ? Math.max(20, (step.value / maxFunnelValue) * 100) : 5;
                  const gradientColors = [
                    "from-blue-500 to-purple-500",
                    "from-purple-500 to-pink-500", 
                    "from-pink-500 to-rose-500"
                  ];
                  
                  return (
                    <div key={step.label} className="flex flex-col items-center flex-1 max-w-[150px]">
                      {/* Percentage */}
                      <span className="text-lg font-bold mb-2 text-foreground">
                        {step.percentage.toFixed(1)}%
                      </span>
                      
                      {/* Bar */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 0.8, delay: index * 0.2, ease: "easeOut" }}
                        className={cn(
                          "w-full rounded-t-lg bg-gradient-to-t relative",
                          gradientColors[index % gradientColors.length]
                        )}
                        style={{ minHeight: 20 }}
                      >
                        {/* Curved connector to next step */}
                        {index < funnelSteps.length - 1 && (
                          <div className="absolute -right-1 top-0 bottom-0 w-2 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/50" />
                          </div>
                        )}
                      </motion.div>
                      
                      {/* Value */}
                      <span className="text-sm text-muted-foreground mt-2">
                        {step.value.toLocaleString("pt-BR")}
                      </span>
                      
                      {/* Label */}
                      <span className="text-xs text-muted-foreground mt-1 text-center">
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Vertical dividers */}
              <div className="absolute inset-x-0 top-0 bottom-0 flex justify-between pointer-events-none">
                {funnelSteps.map((_, i) => (
                  <div key={i} className="flex-1 border-r border-border/20 last:border-0" />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}