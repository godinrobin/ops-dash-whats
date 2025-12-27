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
  AlertCircle
} from "lucide-react";
import { motion } from "framer-motion";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";

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
  color: string;
}

type DateFilter = "today" | "yesterday" | "7days" | "30days";

export default function AdsDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
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
    totalPurchases: 0
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

      // Calculate metrics
      const totalSpend = campaigns?.reduce((sum, c) => sum + (c.spend || 0), 0) || 0;
      const totalImpressions = campaigns?.reduce((sum, c) => sum + (c.impressions || 0), 0) || 0;
      const totalClicks = campaigns?.reduce((sum, c) => sum + (c.clicks || 0), 0) || 0;
      const totalConversions = campaigns?.reduce((sum, c) => sum + (c.conversions || 0), 0) || 0;

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
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        revenue: totalRevenue,
        profit: totalRevenue - totalSpend,
        totalMessages,
        totalPurchases
      });
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("ads-sync-campaigns");
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
    { title: "Receita", value: `R$ ${metrics.revenue.toFixed(2)}`, icon: DollarSign, color: "text-green-400" },
    { 
      title: "Lucro", 
      value: `R$ ${metrics.profit.toFixed(2)}`, 
      icon: metrics.profit >= 0 ? TrendingUp : TrendingDown, 
      color: metrics.profit >= 0 ? "text-green-400" : "text-red-400" 
    },
  ];

  const funnelSteps: FunnelStep[] = [
    { 
      label: "Total de Mensagens", 
      value: metrics.totalMessages, 
      percentage: 100,
      color: "bg-blue-500"
    },
    { 
      label: "Compras Enviadas", 
      value: metrics.totalPurchases, 
      percentage: metrics.totalMessages > 0 ? (metrics.totalPurchases / metrics.totalMessages) * 100 : 0,
      color: "bg-green-500"
    },
  ];

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

          <Button 
            variant="outline" 
            size="icon"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCcw className={cn("h-4 w-4", syncing && "animate-spin")} />
          </Button>
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

      {/* Conversion Funnel */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Funil de Conversão WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-4">
              {funnelSteps.map((step, index) => (
                <div key={step.label} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{step.label}</span>
                    <span className="font-medium">
                      {step.value.toLocaleString("pt-BR")} ({step.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-8 bg-muted rounded-lg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${step.percentage}%` }}
                      transition={{ duration: 0.8, delay: index * 0.2 }}
                      className={cn("h-full rounded-lg", step.color)}
                    />
                  </div>
                </div>
              ))}

              {metrics.totalMessages > 0 && (
                <div className="pt-4 border-t border-border mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Taxa de Conversão</span>
                    <span className="text-lg font-bold text-green-400">
                      {((metrics.totalPurchases / metrics.totalMessages) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
