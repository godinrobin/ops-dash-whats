import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  DollarSign, 
  TrendingUp, 
  ShoppingCart, 
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Phone,
  Calendar,
  Target,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type DateFilter = "today" | "yesterday" | "7days" | "30days" | "all";
type SortField = "purchase_sent_at" | "purchase_value" | "phone" | "name";
type SortOrder = "asc" | "desc";

interface SaleRecord {
  id: string;
  phone: string;
  name: string | null;
  purchase_value: number | null;
  purchase_sent_at: string | null;
  ad_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_account_id: string | null;
  first_contact_at: string | null;
  // Joined data
  ad_name?: string | null;
  campaign_name?: string | null;
  adset_name?: string | null;
}

interface AdInfo {
  ad_id: string;
  name: string;
  campaign_id: string | null;
  adset_id: string | null;
}

interface CampaignInfo {
  campaign_id: string;
  name: string;
}

interface AdsetInfo {
  adset_id: string;
  name: string;
}

interface AdAccount {
  id: string;
  name: string | null;
  ad_account_id: string;
  is_selected: boolean;
}

export default function AdsSales() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [ads, setAds] = useState<Record<string, AdInfo>>({});
  const [campaigns, setCampaigns] = useState<Record<string, CampaignInfo>>({});
  const [adsets, setAdsets] = useState<Record<string, AdsetInfo>>({});
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(["all"]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("purchase_sent_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Active ad accounts only
  const activeAdAccounts = adAccounts.filter(acc => acc.is_selected === true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, dateFilter, selectedAccounts]);

  const getDateRange = (filter: DateFilter) => {
    const now = new Date();
    switch (filter) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "yesterday":
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case "7days":
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case "30days":
        return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      case "all":
        return null;
    }
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load ad accounts
      const { data: accounts } = await supabase
        .from("ads_ad_accounts")
        .select("id, name, ad_account_id, is_selected")
        .eq("user_id", user.id);
      
      setAdAccounts(accounts || []);

      // Get active account IDs for filtering
      const activeAccountIds = (accounts || []).filter(a => a.is_selected).map(a => a.id);
      
      // Build query for sales (leads with purchase)
      let salesQuery = supabase
        .from("ads_whatsapp_leads")
        .select("*")
        .eq("user_id", user.id)
        .not("purchase_sent_at", "is", null);

      // Apply date filter
      const dateRange = getDateRange(dateFilter);
      if (dateRange) {
        salesQuery = salesQuery
          .gte("purchase_sent_at", dateRange.start.toISOString())
          .lte("purchase_sent_at", dateRange.end.toISOString());
      }

      // Apply account filter
      const hasAllSelected = selectedAccounts.includes("all");
      if (!hasAllSelected && selectedAccounts.length > 0) {
        salesQuery = salesQuery.in("ad_account_id", selectedAccounts);
      } else if (hasAllSelected && activeAccountIds.length > 0) {
        salesQuery = salesQuery.in("ad_account_id", activeAccountIds);
      }

      const { data: salesData } = await salesQuery;
      setSales(salesData || []);

      // Load ads, campaigns, adsets for name lookup
      const { data: adsData } = await supabase
        .from("ads_ads")
        .select("ad_id, name, campaign_id, adset_id")
        .eq("user_id", user.id);
      
      const adsMap: Record<string, AdInfo> = {};
      (adsData || []).forEach(ad => {
        if (ad.ad_id) adsMap[ad.ad_id] = ad;
      });
      setAds(adsMap);

      const { data: campaignsData } = await supabase
        .from("ads_campaigns")
        .select("campaign_id, name")
        .eq("user_id", user.id);
      
      const campaignsMap: Record<string, CampaignInfo> = {};
      (campaignsData || []).forEach(c => {
        if (c.campaign_id) campaignsMap[c.campaign_id] = c;
      });
      setCampaigns(campaignsMap);

      const { data: adsetsData } = await supabase
        .from("ads_adsets")
        .select("adset_id, name")
        .eq("user_id", user.id);
      
      const adsetsMap: Record<string, AdsetInfo> = {};
      (adsetsData || []).forEach(a => {
        if (a.adset_id) adsetsMap[a.adset_id] = a;
      });
      setAdsets(adsetsMap);

    } catch (error) {
      console.error("Error loading sales data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Enrich sales with ad/campaign/adset names
  const enrichedSales = useMemo(() => {
    return sales.map(sale => ({
      ...sale,
      ad_name: sale.ad_id ? ads[sale.ad_id]?.name : null,
      campaign_name: sale.campaign_id ? campaigns[sale.campaign_id]?.name : null,
      adset_name: sale.adset_id ? adsets[sale.adset_id]?.name : null,
    }));
  }, [sales, ads, campaigns, adsets]);

  // Filter and sort
  const filteredAndSortedSales = useMemo(() => {
    let result = enrichedSales;

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.phone?.toLowerCase().includes(query) ||
        s.name?.toLowerCase().includes(query) ||
        s.ad_name?.toLowerCase().includes(query) ||
        s.campaign_name?.toLowerCase().includes(query)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case "purchase_sent_at":
          aVal = a.purchase_sent_at ? new Date(a.purchase_sent_at).getTime() : 0;
          bVal = b.purchase_sent_at ? new Date(b.purchase_sent_at).getTime() : 0;
          break;
        case "purchase_value":
          aVal = a.purchase_value || 0;
          bVal = b.purchase_value || 0;
          break;
        case "phone":
          aVal = a.phone || "";
          bVal = b.phone || "";
          break;
        case "name":
          aVal = a.name || "";
          bVal = b.name || "";
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return result;
  }, [enrichedSales, searchQuery, sortField, sortOrder]);

  // Aggregated stats
  const stats = useMemo(() => {
    const totalSales = filteredAndSortedSales.length;
    const totalRevenue = filteredAndSortedSales.reduce((sum, s) => sum + (s.purchase_value || 0), 0);
    const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
    const withAttribution = filteredAndSortedSales.filter(s => s.ad_id).length;
    const attributionRate = totalSales > 0 ? (withAttribution / totalSales) * 100 : 0;
    
    return { totalSales, totalRevenue, avgTicket, withAttribution, attributionRate };
  }, [filteredAndSortedSales]);

  // Sales grouped by ad
  const salesByAd = useMemo(() => {
    const grouped: Record<string, { count: number; value: number; adName: string | null }> = {};
    
    filteredAndSortedSales.forEach(sale => {
      const key = sale.ad_id || "unknown";
      if (!grouped[key]) {
        grouped[key] = { count: 0, value: 0, adName: sale.ad_name };
      }
      grouped[key].count++;
      grouped[key].value += sale.purchase_value || 0;
    });

    return Object.entries(grouped)
      .map(([adId, data]) => ({ adId, ...data }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAndSortedSales]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    return sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  const formatPhone = (phone: string) => {
    // Format as +55 (XX) XXXXX-XXXX
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Vendas</h1>
          <p className="text-muted-foreground">Vendas atribuídas aos seus anúncios</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Account Filter */}
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
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <ShoppingCart className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Vendas</p>
                <p className="text-2xl font-bold">{stats.totalSales}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <DollarSign className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Faturamento</p>
                <p className="text-2xl font-bold">R$ {stats.totalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
                <p className="text-2xl font-bold">R$ {stats.avgTicket.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Target className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Atribuição</p>
                <p className="text-2xl font-bold">{stats.attributionRate.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales by Ad Summary */}
      {salesByAd.length > 0 && salesByAd.some(s => s.adId !== "unknown") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vendas por Anúncio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {salesByAd.slice(0, 5).map((item) => (
                <div key={item.adId} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.adId === "unknown" ? "Sem atribuição" : (item.adName || item.adId)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">{item.count} vendas</span>
                    <span className="font-medium text-green-500">R$ {item.value.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por telefone, nome ou anúncio..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Sales Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredAndSortedSales.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma venda encontrada</h3>
              <p className="text-muted-foreground">
                As vendas detectadas pelo Tag Whats aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort("phone")}
                        className="-ml-3"
                      >
                        Comprador
                        <SortIcon field="phone" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort("purchase_value")}
                        className="-ml-3"
                      >
                        Valor
                        <SortIcon field="purchase_value" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort("purchase_sent_at")}
                        className="-ml-3"
                      >
                        Data
                        <SortIcon field="purchase_sent_at" />
                      </Button>
                    </TableHead>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Campanha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredAndSortedSales.map((sale) => (
                      <motion.tr
                        key={sale.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="border-b"
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{formatPhone(sale.phone)}</p>
                              {sale.name && (
                                <p className="text-sm text-muted-foreground">{sale.name}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-green-500">
                            R$ {(sale.purchase_value || 0).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {sale.purchase_sent_at 
                              ? format(parseISO(sale.purchase_sent_at), "dd/MM/yy HH:mm", { locale: ptBR })
                              : "-"
                            }
                          </div>
                        </TableCell>
                        <TableCell>
                          {sale.ad_id ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="max-w-[150px] truncate">
                                    {sale.ad_name || sale.ad_id.slice(0, 12) + "..."}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-mono text-xs">{sale.ad_id}</p>
                                  {sale.ad_name && <p>{sale.ad_name}</p>}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground text-sm">Sem atribuição</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {sale.campaign_id ? (
                            <span className="text-sm">
                              {sale.campaign_name || sale.campaign_id.slice(0, 12) + "..."}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Footer */}
      {filteredAndSortedSales.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Exibindo {filteredAndSortedSales.length} vendas • 
          Total: R$ {stats.totalRevenue.toFixed(2)} • 
          {stats.withAttribution} com atribuição de anúncio
        </div>
      )}
    </div>
  );
}
