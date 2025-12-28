import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Search, Eye, DollarSign, MousePointerClick, TrendingUp, Target,
  Users, ChevronDown, ChevronRight, MessageCircle, BarChart3, Loader2,
  Calendar
} from "lucide-react";
import { format, startOfDay, subDays, startOfYesterday, endOfYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

type DateFilterType = "all" | "today" | "yesterday" | "7days" | "30days";

interface UserAdAccount {
  id: string;
  user_id: string;
  user_email: string;
  username: string;
  ad_account_id: string;
  name: string | null;
  is_selected: boolean;
  currency: string | null;
  timezone: string | null;
  facebook_account_name: string | null;
}

interface CampaignData {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpm: number;
  cpc: number;
  ctr: number;
  conversions: number;
  cost_per_result: number;
  messaging_conversations_started: number;
  cost_per_message: number;
}

interface AdsetData {
  id: string;
  adset_id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpm: number;
  cpc: number;
  ctr: number;
  results: number;
  cost_per_result: number;
}

interface AdData {
  id: string;
  ad_id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpm: number;
  cpc: number;
  ctr: number;
  results: number;
  cost_per_result: number;
  thumbnail_url: string | null;
}

interface UserAggregatedMetrics {
  user_id: string;
  user_email: string;
  username: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_messages: number;
  accounts_count: number;
  campaigns_count: number;
}

export function AdminAdsMetrics() {
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userAccounts, setUserAccounts] = useState<UserAdAccount[]>([]);
  const [userMetrics, setUserMetrics] = useState<UserAggregatedMetrics[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [adsets, setAdsets] = useState<AdsetData[]>([]);
  const [ads, setAds] = useState<AdData[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const getDateRange = (): { start: Date | null; end: Date | null } => {
    const now = new Date();
    switch (dateFilter) {
      case "today":
        return { start: startOfDay(now), end: null };
      case "yesterday":
        return { start: startOfYesterday(), end: endOfYesterday() };
      case "7days":
        return { start: startOfDay(subDays(now, 7)), end: null };
      case "30days":
        return { start: startOfDay(subDays(now, 30)), end: null };
      default:
        return { start: null, end: null };
    }
  };

  useEffect(() => {
    loadAllUserMetrics();
  }, [dateFilter]);

  const loadAllUserMetrics = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      // Load all ad accounts with user info
      const { data: accounts, error: accountsError } = await supabase
        .from("ads_ad_accounts")
        .select(`
          *,
          ads_facebook_accounts (name)
        `)
        .order("created_at", { ascending: false });

      if (accountsError) throw accountsError;

      // Get user profiles
      const userIds = [...new Set(accounts?.map(a => a.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.username]) || []);

      // Load campaigns for aggregation with date filter
      let campaignsQuery = supabase.from("ads_campaigns").select("*");
      
      if (start) {
        campaignsQuery = campaignsQuery.gte("updated_at", start.toISOString());
      }
      if (end) {
        campaignsQuery = campaignsQuery.lte("updated_at", end.toISOString());
      }

      const { data: allCampaigns, error: campaignsError } = await campaignsQuery;

      if (campaignsError) throw campaignsError;

      // Aggregate metrics by user
      const userMetricsMap = new Map<string, UserAggregatedMetrics>();
      
      accounts?.forEach(account => {
        const userId = account.user_id;
        if (!userMetricsMap.has(userId)) {
          userMetricsMap.set(userId, {
            user_id: userId,
            user_email: profileMap.get(userId) || userId,
            username: profileMap.get(userId) || userId,
            total_spend: 0,
            total_impressions: 0,
            total_clicks: 0,
            total_conversions: 0,
            total_messages: 0,
            accounts_count: 0,
            campaigns_count: 0
          });
        }
        const userMetric = userMetricsMap.get(userId)!;
        userMetric.accounts_count++;
      });

      // Aggregate campaign data
      allCampaigns?.forEach(campaign => {
        const userMetric = userMetricsMap.get(campaign.user_id);
        if (userMetric) {
          userMetric.total_spend += campaign.spend || 0;
          userMetric.total_impressions += campaign.impressions || 0;
          userMetric.total_clicks += campaign.clicks || 0;
          userMetric.total_conversions += (campaign as any).meta_conversions || 0;
          userMetric.total_messages += (campaign as any).messaging_conversations_started || 0;
          userMetric.campaigns_count++;
        }
      });

      // Enrich accounts with user info
      const enrichedAccounts = accounts?.map(a => ({
        ...a,
        user_email: profileMap.get(a.user_id) || a.user_id,
        username: profileMap.get(a.user_id) || a.user_id,
        facebook_account_name: a.ads_facebook_accounts?.name || null
      })) || [];

      setUserAccounts(enrichedAccounts);
      setUserMetrics(Array.from(userMetricsMap.values()).sort((a, b) => b.total_spend - a.total_spend));
    } catch (err) {
      console.error("Error loading ad metrics:", err);
      toast.error("Erro ao carregar métricas de anúncios");
    } finally {
      setLoading(false);
    }
  };

  const loadUserDetails = async (userId: string) => {
    setLoadingDetails(true);
    try {
      // Load campaigns for this user
      const { data: campaignsData, error: campaignsError } = await supabase
        .from("ads_campaigns")
        .select("*")
        .eq("user_id", userId)
        .order("spend", { ascending: false });

      if (campaignsError) throw campaignsError;

      // Load adsets for this user
      const { data: adsetsData, error: adsetsError } = await supabase
        .from("ads_adsets")
        .select("*")
        .eq("user_id", userId)
        .order("spend", { ascending: false });

      if (adsetsError) throw adsetsError;

      // Load ads for this user
      const { data: adsData, error: adsError } = await supabase
        .from("ads_ads")
        .select("*")
        .eq("user_id", userId)
        .order("spend", { ascending: false });

      if (adsError) throw adsError;

      setCampaigns(campaignsData?.map(c => ({
        id: c.id,
        campaign_id: c.campaign_id,
        name: c.name || c.campaign_id,
        status: c.status || "unknown",
        spend: c.spend || 0,
        impressions: c.impressions || 0,
        clicks: c.clicks || 0,
        cpm: c.cpm || 0,
        cpc: c.cpc || 0,
        ctr: c.ctr || 0,
        conversions: (c as any).meta_conversions || 0,
        cost_per_result: c.cost_per_result || 0,
        messaging_conversations_started: (c as any).messaging_conversations_started || 0,
        cost_per_message: (c as any).cost_per_message || 0
      })) || []);

      setAdsets(adsetsData?.map(a => ({
        id: a.id,
        adset_id: a.adset_id,
        name: a.name || a.adset_id,
        status: a.status || "unknown",
        spend: a.spend || 0,
        impressions: a.impressions || 0,
        clicks: a.clicks || 0,
        cpm: a.cpm || 0,
        cpc: a.cpc || 0,
        ctr: a.ctr || 0,
        results: a.results || 0,
        cost_per_result: a.cost_per_result || 0
      })) || []);

      setAds(adsData?.map(a => ({
        id: a.id,
        ad_id: a.ad_id,
        name: a.name || a.ad_id,
        status: a.status || "unknown",
        spend: a.spend || 0,
        impressions: a.impressions || 0,
        clicks: a.clicks || 0,
        cpm: a.cpm || 0,
        cpc: a.cpc || 0,
        ctr: a.ctr || 0,
        results: a.results || 0,
        cost_per_result: a.cost_per_result || 0,
        thumbnail_url: a.thumbnail_url
      })) || []);

      setSelectedUserId(userId);
    } catch (err) {
      console.error("Error loading user details:", err);
      toast.error("Erro ao carregar detalhes do usuário");
    } finally {
      setLoadingDetails(false);
    }
  };

  const filteredUsers = userMetrics.filter(u => 
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.user_email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;
  const formatNumber = (value: number) => value.toLocaleString("pt-BR");
  const formatPercent = (value: number) => `${value.toFixed(2)}%`;

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      ACTIVE: "bg-green-500/20 text-green-400",
      PAUSED: "bg-yellow-500/20 text-yellow-400",
      DELETED: "bg-red-500/20 text-red-400",
      ARCHIVED: "bg-gray-500/20 text-gray-400"
    };
    return (
      <Badge className={statusColors[status] || "bg-gray-500/20 text-gray-400"}>
        {status}
      </Badge>
    );
  };

  const selectedUser = userMetrics.find(u => u.user_id === selectedUserId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Usuários com Ads</p>
                <p className="text-2xl font-bold">{userMetrics.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <DollarSign className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Investido</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(userMetrics.reduce((sum, u) => sum + u.total_spend, 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Eye className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Impressões</p>
                <p className="text-2xl font-bold">
                  {formatNumber(userMetrics.reduce((sum, u) => sum + u.total_impressions, 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10">
                <MessageCircle className="h-5 w-5 text-pink-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Conversas</p>
                <p className="text-2xl font-bold">
                  {formatNumber(userMetrics.reduce((sum, u) => sum + u.total_messages, 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Date Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar usuário..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={dateFilter} onValueChange={(value: DateFilterType) => setDateFilter(value)}>
          <SelectTrigger className="w-[180px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por data" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="yesterday">Ontem</SelectItem>
            <SelectItem value="7days">Últimos 7 dias</SelectItem>
            <SelectItem value="30days">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Métricas por Usuário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-right">Contas</TableHead>
                  <TableHead className="text-right">Campanhas</TableHead>
                  <TableHead className="text-right">Investido</TableHead>
                  <TableHead className="text-right">Impressões</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead className="text-right">Conversas</TableHead>
                  <TableHead className="text-right">Conversões</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Nenhum usuário com contas de anúncios encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow 
                      key={user.user_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => loadUserDetails(user.user_id)}
                    >
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell className="text-right">{user.accounts_count}</TableCell>
                      <TableCell className="text-right">{user.campaigns_count}</TableCell>
                      <TableCell className="text-right text-red-400">{formatCurrency(user.total_spend)}</TableCell>
                      <TableCell className="text-right">{formatNumber(user.total_impressions)}</TableCell>
                      <TableCell className="text-right">{formatNumber(user.total_clicks)}</TableCell>
                      <TableCell className="text-right text-pink-400">{formatNumber(user.total_messages)}</TableCell>
                      <TableCell className="text-right text-green-400">{formatNumber(user.total_conversions)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUserId} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Métricas de {selectedUser?.username}
            </DialogTitle>
          </DialogHeader>
          
          {loadingDetails ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="campaigns" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="campaigns">Campanhas ({campaigns.length})</TabsTrigger>
                <TabsTrigger value="adsets">Conjuntos ({adsets.length})</TabsTrigger>
                <TabsTrigger value="ads">Anúncios ({ads.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="campaigns">
                <ScrollArea className="h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Investido</TableHead>
                        <TableHead className="text-right">Impressões</TableHead>
                        <TableHead className="text-right">Cliques</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">CPM</TableHead>
                        <TableHead className="text-right">CPC</TableHead>
                        <TableHead className="text-right">Conversas</TableHead>
                        <TableHead className="text-right">Custo/Msg</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((campaign) => (
                        <TableRow key={campaign.id}>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {campaign.name}
                          </TableCell>
                          <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                          <TableCell className="text-right text-red-400">{formatCurrency(campaign.spend)}</TableCell>
                          <TableCell className="text-right">{formatNumber(campaign.impressions)}</TableCell>
                          <TableCell className="text-right">{formatNumber(campaign.clicks)}</TableCell>
                          <TableCell className="text-right">{formatPercent(campaign.ctr)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(campaign.cpm)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(campaign.cpc)}</TableCell>
                          <TableCell className="text-right text-pink-400">
                            {formatNumber(campaign.messaging_conversations_started)}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(campaign.cost_per_message)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="adsets">
                <ScrollArea className="h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Investido</TableHead>
                        <TableHead className="text-right">Impressões</TableHead>
                        <TableHead className="text-right">Cliques</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">CPM</TableHead>
                        <TableHead className="text-right">CPC</TableHead>
                        <TableHead className="text-right">Resultados</TableHead>
                        <TableHead className="text-right">Custo/Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adsets.map((adset) => (
                        <TableRow key={adset.id}>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {adset.name}
                          </TableCell>
                          <TableCell>{getStatusBadge(adset.status)}</TableCell>
                          <TableCell className="text-right text-red-400">{formatCurrency(adset.spend)}</TableCell>
                          <TableCell className="text-right">{formatNumber(adset.impressions)}</TableCell>
                          <TableCell className="text-right">{formatNumber(adset.clicks)}</TableCell>
                          <TableCell className="text-right">{formatPercent(adset.ctr)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(adset.cpm)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(adset.cpc)}</TableCell>
                          <TableCell className="text-right text-green-400">{formatNumber(adset.results)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(adset.cost_per_result)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="ads">
                <ScrollArea className="h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Preview</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Investido</TableHead>
                        <TableHead className="text-right">Impressões</TableHead>
                        <TableHead className="text-right">Cliques</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">CPM</TableHead>
                        <TableHead className="text-right">CPC</TableHead>
                        <TableHead className="text-right">Resultados</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ads.map((ad) => (
                        <TableRow key={ad.id}>
                          <TableCell>
                            {ad.thumbnail_url ? (
                              <img 
                                src={ad.thumbnail_url} 
                                alt="Ad preview" 
                                className="w-12 h-12 object-cover rounded"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium max-w-[180px] truncate">
                            {ad.name}
                          </TableCell>
                          <TableCell>{getStatusBadge(ad.status)}</TableCell>
                          <TableCell className="text-right text-red-400">{formatCurrency(ad.spend)}</TableCell>
                          <TableCell className="text-right">{formatNumber(ad.impressions)}</TableCell>
                          <TableCell className="text-right">{formatNumber(ad.clicks)}</TableCell>
                          <TableCell className="text-right">{formatPercent(ad.ctr)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(ad.cpm)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(ad.cpc)}</TableCell>
                          <TableCell className="text-right text-green-400">{formatNumber(ad.results)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
