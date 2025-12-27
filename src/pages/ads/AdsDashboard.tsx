import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  Info
} from "lucide-react";
import { motion } from "framer-motion";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricCard {
  title: string;
  value: string;
  change?: number;
  icon: React.ElementType;
  color: string;
}

interface FunnelStep {
  label: string;
  value: number;
  percentage: number;
}

type DateFilter = "today" | "yesterday" | "7days" | "30days";

export default function AdsDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
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
    conversionValue: 0
  });
  const [hasAccounts, setHasAccounts] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, dateFilter, selectedAccount]);

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

      // Get campaigns data
      let query = supabase
        .from("ads_campaigns")
        .select("*")
        .eq("user_id", user.id);

      if (selectedAccount !== "all") {
        query = query.eq("ad_account_id", selectedAccount);
      }

      const { data: campaigns } = await query;

      // Calculate metrics - use meta_conversions for conversions
      const totalSpend = campaigns?.reduce((sum, c) => sum + (c.spend || 0), 0) || 0;
      const totalImpressions = campaigns?.reduce((sum, c) => sum + (c.impressions || 0), 0) || 0;
      const totalClicks = campaigns?.reduce((sum, c) => sum + (c.clicks || 0), 0) || 0;
      const totalConversions = campaigns?.reduce((sum, c) => sum + ((c as any).meta_conversions || 0), 0) || 0;
      const totalConversionValue = campaigns?.reduce((sum, c) => sum + ((c as any).conversion_value || 0), 0) || 0;
      const totalMessaging = campaigns?.reduce((sum, c) => sum + ((c as any).messaging_conversations_started || 0), 0) || 0;

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
        conversionValue: totalConversionValue
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
      const { error } = await supabase.functions.invoke("facebook-campaigns", { 
        body: { 
          action: "sync_campaigns",
          datePreset: datePresetMap[dateFilter]
        } 
      });
      if (error) throw error;
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

  const metricCards: MetricCard[] = [
    { title: "Investido", value: `R$ ${metrics.spend.toFixed(2)}`, icon: DollarSign, color: "text-red-400" },
    { title: "Impressões", value: metrics.impressions.toLocaleString("pt-BR"), icon: Eye, color: "text-blue-400" },
    { title: "Cliques", value: metrics.clicks.toLocaleString("pt-BR"), icon: MousePointerClick, color: "text-purple-400" },
    { title: "Conversões", value: metrics.conversions.toString(), icon: Target, color: "text-green-400" },
    { title: "CPM", value: `R$ ${metrics.cpm.toFixed(2)}`, icon: TrendingUp, color: "text-orange-400" },
    { title: "CTR", value: `${metrics.ctr.toFixed(2)}%`, icon: TrendingUp, color: "text-cyan-400" },
    { title: "CPC", value: `R$ ${metrics.cpc.toFixed(2)}`, icon: DollarSign, color: "text-yellow-400" },
    { title: "ROAS", value: `${metrics.roas.toFixed(2)}x`, icon: TrendingUp, color: "text-emerald-400" },
  ];

  const resultCards: MetricCard[] = [
    { title: "Receita (Conversões)", value: `R$ ${metrics.conversionValue.toFixed(2)}`, icon: DollarSign, color: "text-green-400" },
    { 
      title: "Lucro", 
      value: `R$ ${metrics.profit.toFixed(2)}`, 
      icon: metrics.profit >= 0 ? TrendingUp : TrendingDown, 
      color: metrics.profit >= 0 ? "text-green-400" : "text-red-400" 
    },
  ];

  // Funnel data for Meta Ads (using campaign data)
  const funnelSteps: FunnelStep[] = [
    { 
      label: "Cliques", 
      value: metrics.clicks, 
      percentage: metrics.clicks > 0 ? 100 : 0,
    },
    { 
      label: "Conversas", 
      value: metrics.totalMessages, 
      percentage: metrics.clicks > 0 ? (metrics.totalMessages / metrics.clicks) * 100 : 0,
    },
    { 
      label: "Compras", 
      value: metrics.totalPurchases, 
      percentage: metrics.clicks > 0 ? (metrics.totalPurchases / metrics.clicks) * 100 : 0,
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
        <Button onClick={() => window.location.href = "/ads/settings"}>
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
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Conta de anúncios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {adAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name || acc.ad_account_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {metricCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="bg-card/50 backdrop-blur border-border/50">
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
            </Card>
          </motion.div>
        ))}
      </div>

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
