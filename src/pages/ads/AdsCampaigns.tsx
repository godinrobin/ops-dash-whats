import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Plus, 
  RefreshCcw, 
  Search, 
  MoreVertical,
  Edit,
  Pause,
  Play,
  ChevronUp,
  ChevronDown,
  Calendar,
  Eye,
  EyeOff,
  Pencil,
  Columns3,
  Power,
  DollarSign,
  Check
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Campaign {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget: number;
  lifetime_budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  results: number;
  cost_per_result: number;
  cpm: number;
  ctr: number;
  ad_account_id: string;
  reach: number;
  cpc: number;
  cost_per_message: number;
  messaging_conversations_started: number;
  meta_conversions: number;
  conversion_value: number;
  last_synced_at?: string;
}

interface AdSet {
  id: string;
  adset_id: string;
  campaign_id: string;
  name: string;
  status: string;
  daily_budget: number;
  lifetime_budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cost_per_message: number;
  messaging_conversations_started: number;
  meta_conversions: number;
  conversion_value: number;
  ad_account_id: string;
  last_synced_at?: string;
}

interface Ad {
  id: string;
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  name: string;
  status: string;
  thumbnail_url: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cost_per_message: number;
  messaging_conversations_started: number;
  meta_conversions: number;
  conversion_value: number;
  ad_account_id: string;
  last_synced_at?: string;
}

type SortField = 'name' | 'status' | 'daily_budget' | 'spend' | 'impressions' | 'reach' | 'cpm' | 'cpc' | 'ctr' | 'cost_per_message' | 'messaging_conversations_started' | 'meta_conversions' | 'conversion_value' | 'profit';
type SortOrder = 'asc' | 'desc';
type DateFilter = "today" | "yesterday" | "7days" | "30days" | "month";
type ViewLevel = 'campaign' | 'adset' | 'ad';

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  width: number;
}

const defaultColumns: ColumnConfig[] = [
  { key: 'name', label: 'Nome', visible: true, width: 180 },
  { key: 'daily_budget', label: 'Orçamento', visible: true, width: 100 },
  { key: 'spend', label: 'Gasto', visible: true, width: 85 },
  { key: 'impressions', label: 'Impr.', visible: true, width: 75 },
  { key: 'reach', label: 'Alcance', visible: true, width: 75 },
  { key: 'cpm', label: 'CPM', visible: true, width: 70 },
  { key: 'cpc', label: 'CPC', visible: true, width: 70 },
  { key: 'ctr', label: 'CTR', visible: true, width: 65 },
  { key: 'cost_per_message', label: 'C/Msg', visible: true, width: 70 },
  { key: 'messaging_conversations_started', label: 'Conv.', visible: true, width: 65 },
  { key: 'meta_conversions', label: 'Vendas', visible: true, width: 65 },
  { key: 'conversion_value', label: 'Valor', visible: true, width: 80 },
  { key: 'profit', label: 'Lucro', visible: true, width: 80 },
];

const adColumns: ColumnConfig[] = [
  { key: 'thumbnail', label: 'Preview', visible: true, width: 60 },
  { key: 'name', label: 'Nome', visible: true, width: 180 },
  { key: 'spend', label: 'Gasto', visible: true, width: 85 },
  { key: 'impressions', label: 'Impr.', visible: true, width: 75 },
  { key: 'reach', label: 'Alcance', visible: true, width: 75 },
  { key: 'cpm', label: 'CPM', visible: true, width: 70 },
  { key: 'cpc', label: 'CPC', visible: true, width: 70 },
  { key: 'ctr', label: 'CTR', visible: true, width: 65 },
  { key: 'cost_per_message', label: 'C/Msg', visible: true, width: 70 },
  { key: 'messaging_conversations_started', label: 'Conv.', visible: true, width: 65 },
  { key: 'meta_conversions', label: 'Vendas', visible: true, width: 65 },
  { key: 'conversion_value', label: 'Valor', visible: true, width: 80 },
  { key: 'profit', label: 'Lucro', visible: true, width: 80 },
];

const viewLevelTabs = [
  { value: 'campaign' as ViewLevel, label: 'Campanhas', icon: '📊' },
  { value: 'adset' as ViewLevel, label: 'Conjuntos de anúncios', icon: '📋' },
  { value: 'ad' as ViewLevel, label: 'Anúncios', icon: '📄' },
];

export default function AdsCampaigns() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adsets, setAdsets] = useState<AdSet[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [salesByAd, setSalesByAd] = useState<Record<string, { count: number; value: number }>>({});
  const [salesByCampaign, setSalesByCampaign] = useState<Record<string, { count: number; value: number }>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editBudgetDialogOpen, setEditBudgetDialogOpen] = useState(false);
  const [bulkBudgetDialogOpen, setBulkBudgetDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedAdset, setSelectedAdset] = useState<AdSet | null>(null);
  const [newBudget, setNewBudget] = useState("");
  const [bulkNewBudget, setBulkNewBudget] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('spend');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const saved = localStorage.getItem('ads_campaigns_date_filter');
    return (saved as DateFilter) || "7days";
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Persist date filter to localStorage
  useEffect(() => {
    localStorage.setItem('ads_campaigns_date_filter', dateFilter);
  }, [dateFilter]);
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [viewLevel, setViewLevel] = useState<ViewLevel>('campaign');
  const [accountFilterOpen, setAccountFilterOpen] = useState(false);
  // Hierarchy selection state
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [selectedAdsetIds, setSelectedAdsetIds] = useState<Set<string>>(new Set());

  const datePresetMap: Record<DateFilter, string> = {
    today: "today",
    yesterday: "yesterday",
    "7days": "last_7d",
    "30days": "last_30d",
    month: "this_month"
  };

  // New campaign form state
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    objective: "MESSAGES",
    daily_budget: "",
    selected_accounts: [] as string[]
  });

  // Filter to only show active (is_selected) ad accounts
  const activeAdAccounts = useMemo(() => {
    return adAccounts.filter(acc => acc.is_selected === true);
  }, [adAccounts]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedAccounts]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load ad accounts
      const { data: accounts } = await supabase
        .from("ads_ad_accounts")
        .select("*")
        .eq("user_id", user.id);

      setAdAccounts(accounts || []);

      // Get active account IDs (is_selected = true)
      const activeAccountIds = (accounts || [])
        .filter(acc => acc.is_selected === true)
        .map(acc => acc.id);

      // Use selected accounts if any, otherwise use only active accounts
      const accountIdsToFilter = selectedAccounts.length > 0 
        ? selectedAccounts 
        : activeAccountIds;

      // Load campaigns
      let campaignsQuery = supabase
        .from("ads_campaigns")
        .select("*")
        .eq("user_id", user.id)
        .order("spend", { ascending: false });

      // Apply filter if we have accounts to filter by
      if (accountIdsToFilter.length > 0) {
        campaignsQuery = campaignsQuery.in("ad_account_id", accountIdsToFilter);
      }

      const { data: campaignsData } = await campaignsQuery;
      setCampaigns(campaignsData || []);

      // Load adsets
      let adsetsQuery = supabase
        .from("ads_adsets")
        .select("*")
        .eq("user_id", user.id)
        .order("spend", { ascending: false });

      if (accountIdsToFilter.length > 0) {
        adsetsQuery = adsetsQuery.in("ad_account_id", accountIdsToFilter);
      }

      const { data: adsetsData } = await adsetsQuery;
      setAdsets(adsetsData || []);

      // Load ads
      let adsQuery = supabase
        .from("ads_ads")
        .select("*")
        .eq("user_id", user.id)
        .order("spend", { ascending: false });

      if (accountIdsToFilter.length > 0) {
        adsQuery = adsQuery.in("ad_account_id", accountIdsToFilter);
      }

      const { data: adsData } = await adsQuery;
      setAds(adsData || []);

      // Load sales from ads_whatsapp_leads (vendas atribuídas)
      const { data: salesData } = await supabase
        .from("ads_whatsapp_leads")
        .select("ad_id, campaign_id, purchase_value")
        .eq("user_id", user.id)
        .not("purchase_sent_at", "is", null);

      // Group sales by ad_id and campaign_id
      const adSalesMap: Record<string, { count: number; value: number }> = {};
      const campaignSalesMap: Record<string, { count: number; value: number }> = {};
      
      (salesData || []).forEach(sale => {
        if (sale.ad_id) {
          if (!adSalesMap[sale.ad_id]) {
            adSalesMap[sale.ad_id] = { count: 0, value: 0 };
          }
          adSalesMap[sale.ad_id].count++;
          adSalesMap[sale.ad_id].value += sale.purchase_value || 0;
        }
        if (sale.campaign_id) {
          if (!campaignSalesMap[sale.campaign_id]) {
            campaignSalesMap[sale.campaign_id] = { count: 0, value: 0 };
          }
          campaignSalesMap[sale.campaign_id].count++;
          campaignSalesMap[sale.campaign_id].value += sale.purchase_value || 0;
        }
      });
      
      setSalesByAd(adSalesMap);
      setSalesByCampaign(campaignSalesMap);
      
      // Get last synced time
      if (campaignsData && campaignsData.length > 0) {
        const mostRecent = campaignsData.reduce((latest, c) => {
          if (!c.last_synced_at) return latest;
          if (!latest) return c.last_synced_at;
          return new Date(c.last_synced_at) > new Date(latest) ? c.last_synced_at : latest;
        }, null as string | null);
        setLastSyncedAt(mostRecent);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      // Sync all three levels
      const results = await Promise.all([
        supabase.functions.invoke("facebook-campaigns", { 
          body: { action: "sync_campaigns", datePreset: datePresetMap[dateFilter] } 
        }),
        supabase.functions.invoke("facebook-campaigns", { 
          body: { action: "sync_adsets", datePreset: datePresetMap[dateFilter] } 
        }),
        supabase.functions.invoke("facebook-campaigns", { 
          body: { action: "sync_ads", datePreset: datePresetMap[dateFilter] } 
        }),
      ]);
      
      // Check for auth errors
      const hasAuthError = results.some(r => 
        r.data?.error === "Unauthorized" || String(r.error).includes("401")
      );
      
      if (hasAuthError) {
        splashedToast.error("Sessão expirada. Faça login novamente.");
        await supabase.auth.signOut();
        window.location.hash = "#/auth";
        return;
      }
      
      splashedToast.success("Dados sincronizados!");
      await loadData();
    } catch (error) {
      console.error("Sync error:", error);
      splashedToast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  // Re-sync when date filter changes
  useEffect(() => {
    if (user && !loading) {
      handleSync();
    }
  }, [dateFilter]);

  const handleToggleCampaign = async (campaign: Campaign) => {
    const newStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    
    try {
      const { error } = await supabase.functions.invoke("facebook-campaigns", {
        body: {
          action: "update_campaign_status",
          campaignId: campaign.campaign_id,
          adAccountId: campaign.ad_account_id,
          status: newStatus
        }
      });

      if (error) throw error;

      setCampaigns(prev => prev.map(c => 
        c.id === campaign.id ? { ...c, status: newStatus } : c
      ));

      splashedToast.success(`Campanha ${newStatus === "ACTIVE" ? "ativada" : "pausada"}!`);
    } catch (error) {
      console.error("Toggle error:", error);
      splashedToast.error("Erro ao alterar status");
    }
  };

  const handleToggleAdset = async (adset: AdSet) => {
    const newStatus = adset.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    
    try {
      const { error } = await supabase.functions.invoke("facebook-campaigns", {
        body: {
          action: "update_adset_status",
          adsetId: adset.adset_id,
          adAccountId: adset.ad_account_id,
          status: newStatus
        }
      });

      if (error) throw error;

      setAdsets(prev => prev.map(a => 
        a.id === adset.id ? { ...a, status: newStatus } : a
      ));

      splashedToast.success(`Conjunto ${newStatus === "ACTIVE" ? "ativado" : "pausado"}!`);
    } catch (error) {
      console.error("Toggle error:", error);
      splashedToast.error("Erro ao alterar status");
    }
  };

  const handleToggleAd = async (ad: Ad) => {
    const newStatus = ad.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    
    try {
      const { error } = await supabase.functions.invoke("facebook-campaigns", {
        body: {
          action: "update_ad_status",
          adId: ad.ad_id,
          adAccountId: ad.ad_account_id,
          status: newStatus
        }
      });

      if (error) throw error;

      setAds(prev => prev.map(a => 
        a.id === ad.id ? { ...a, status: newStatus } : a
      ));

      splashedToast.success(`Anúncio ${newStatus === "ACTIVE" ? "ativado" : "pausado"}!`);
    } catch (error) {
      console.error("Toggle error:", error);
      splashedToast.error("Erro ao alterar status");
    }
  };

  const handleBulkToggle = async (activate: boolean) => {
    const newStatus = activate ? "ACTIVE" : "PAUSED";
    
    try {
      if (viewLevel === 'campaign') {
        const itemsToUpdate = campaigns.filter(c => selectedItems.has(c.id));
        for (const item of itemsToUpdate) {
          await supabase.functions.invoke("facebook-campaigns", {
            body: {
              action: "update_campaign_status",
              campaignId: item.campaign_id,
              adAccountId: item.ad_account_id,
              status: newStatus
            }
          });
        }
        setCampaigns(prev => prev.map(c => 
          selectedItems.has(c.id) ? { ...c, status: newStatus } : c
        ));
      } else if (viewLevel === 'adset') {
        const itemsToUpdate = adsets.filter(a => selectedItems.has(a.id));
        for (const item of itemsToUpdate) {
          await supabase.functions.invoke("facebook-campaigns", {
            body: {
              action: "update_adset_status",
              adsetId: item.adset_id,
              adAccountId: item.ad_account_id,
              status: newStatus
            }
          });
        }
        setAdsets(prev => prev.map(a => 
          selectedItems.has(a.id) ? { ...a, status: newStatus } : a
        ));
      } else {
        const itemsToUpdate = ads.filter(a => selectedItems.has(a.id));
        for (const item of itemsToUpdate) {
          await supabase.functions.invoke("facebook-campaigns", {
            body: {
              action: "update_ad_status",
              adId: item.ad_id,
              adAccountId: item.ad_account_id,
              status: newStatus
            }
          });
        }
        setAds(prev => prev.map(a => 
          selectedItems.has(a.id) ? { ...a, status: newStatus } : a
        ));
      }

      splashedToast.success(`${selectedItems.size} item(s) ${activate ? "ativado(s)" : "pausado(s)"}`);
      setSelectedItems(new Set());
    } catch (error) {
      console.error("Bulk toggle error:", error);
      splashedToast.error("Erro ao alterar itens");
    }
  };

  const handleBulkBudgetUpdate = async () => {
    if (!bulkNewBudget) return;

    try {
      if (viewLevel === 'campaign') {
        const itemsToUpdate = campaigns.filter(c => selectedItems.has(c.id));
        for (const item of itemsToUpdate) {
          await supabase.functions.invoke("facebook-campaigns", {
            body: {
              action: "update_campaign_budget",
              campaignId: item.campaign_id,
              adAccountId: item.ad_account_id,
              daily_budget: parseFloat(bulkNewBudget) * 100
            }
          });
        }
        setCampaigns(prev => prev.map(c => 
          selectedItems.has(c.id) ? { ...c, daily_budget: parseFloat(bulkNewBudget) } : c
        ));
      } else if (viewLevel === 'adset') {
        const itemsToUpdate = adsets.filter(a => selectedItems.has(a.id));
        for (const item of itemsToUpdate) {
          await supabase.functions.invoke("facebook-campaigns", {
            body: {
              action: "update_adset_budget",
              adsetId: item.adset_id,
              adAccountId: item.ad_account_id,
              daily_budget: parseFloat(bulkNewBudget) * 100
            }
          });
        }
        setAdsets(prev => prev.map(a => 
          selectedItems.has(a.id) ? { ...a, daily_budget: parseFloat(bulkNewBudget) } : a
        ));
      }

      setBulkBudgetDialogOpen(false);
      setBulkNewBudget("");
      setSelectedItems(new Set());
      splashedToast.success(`Orçamento atualizado!`);
    } catch (error) {
      console.error("Bulk budget error:", error);
      splashedToast.error("Erro ao atualizar orçamentos");
    }
  };

  const handleUpdateBudget = async () => {
    if (!newBudget) return;

    try {
      if (selectedCampaign) {
        const { error } = await supabase.functions.invoke("facebook-campaigns", {
          body: {
            action: "update_campaign_budget",
            campaignId: selectedCampaign.campaign_id,
            adAccountId: selectedCampaign.ad_account_id,
            daily_budget: parseFloat(newBudget) * 100
          }
        });

        if (error) throw error;

        setCampaigns(prev => prev.map(c => 
          c.id === selectedCampaign.id ? { ...c, daily_budget: parseFloat(newBudget) } : c
        ));
      } else if (selectedAdset) {
        const { error } = await supabase.functions.invoke("facebook-campaigns", {
          body: {
            action: "update_adset_budget",
            adsetId: selectedAdset.adset_id,
            adAccountId: selectedAdset.ad_account_id,
            daily_budget: parseFloat(newBudget) * 100
          }
        });

        if (error) throw error;

        setAdsets(prev => prev.map(a => 
          a.id === selectedAdset.id ? { ...a, daily_budget: parseFloat(newBudget) } : a
        ));
      }

      setEditBudgetDialogOpen(false);
      setNewBudget("");
      setSelectedCampaign(null);
      setSelectedAdset(null);
      splashedToast.success("Orçamento atualizado!");
    } catch (error) {
      console.error("Budget update error:", error);
      splashedToast.error("Erro ao atualizar orçamento");
    }
  };

  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.daily_budget || newCampaign.selected_accounts.length === 0) {
      splashedToast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      const { error } = await supabase.functions.invoke("facebook-campaigns", {
        body: {
          action: "create_campaign",
          name: newCampaign.name,
          objective: newCampaign.objective,
          daily_budget: parseFloat(newCampaign.daily_budget) * 100,
          ad_account_ids: newCampaign.selected_accounts
        }
      });

      if (error) throw error;

      setCreateDialogOpen(false);
      setNewCampaign({ name: "", objective: "MESSAGES", daily_budget: "", selected_accounts: [] });
      splashedToast.success("Campanha(s) criada(s) com sucesso!");
      await loadData();
    } catch (error) {
      console.error("Create campaign error:", error);
      splashedToast.error("Erro ao criar campanha");
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const toggleColumnVisibility = (columnKey: string) => {
    setColumns(prev => prev.map(col => 
      col.key === columnKey ? { ...col, visible: !col.visible } : col
    ));
  };

  const handleColumnResize = (columnKey: string, newWidth: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: Math.max(60, newWidth)
    }));
  };

  const getColumnWidth = (col: ColumnConfig) => {
    return columnWidths[col.key] ?? col.width;
  };

  const toggleAccountSelection = (accountId: string) => {
    setSelectedAccounts(prev => {
      if (prev.includes(accountId)) {
        return prev.filter(id => id !== accountId);
      } else {
        return [...prev, accountId];
      }
    });
  };

  // Filter adsets and ads based on hierarchy selection
  const filteredAdsetsByHierarchy = useMemo(() => {
    if (selectedCampaignIds.size === 0) return adsets;
    return adsets.filter(adset => selectedCampaignIds.has(adset.campaign_id));
  }, [adsets, selectedCampaignIds]);

  const filteredAdsByHierarchy = useMemo(() => {
    if (selectedAdsetIds.size > 0) {
      return ads.filter(ad => selectedAdsetIds.has(ad.adset_id));
    }
    if (selectedCampaignIds.size > 0) {
      return ads.filter(ad => selectedCampaignIds.has(ad.campaign_id));
    }
    return ads;
  }, [ads, selectedAdsetIds, selectedCampaignIds]);

  // Get current data based on view level with hierarchy filtering
  const currentData = useMemo(() => {
    if (viewLevel === 'campaign') return campaigns;
    if (viewLevel === 'adset') return filteredAdsetsByHierarchy;
    return filteredAdsByHierarchy;
  }, [viewLevel, campaigns, filteredAdsetsByHierarchy, filteredAdsByHierarchy]);

  // Counts for tabs - based on hierarchy
  const campaignCount = campaigns.length;
  const adsetCount = filteredAdsetsByHierarchy.length;
  const adCount = filteredAdsByHierarchy.length;

  const sortedData = useMemo(() => {
    const data = [...currentData];
    return data.sort((a: any, b: any) => {
      let aValue: string | number;
      let bValue: string | number;
      
      if (sortField === 'profit') {
        aValue = (a.conversion_value || 0) - (a.spend || 0);
        bValue = (b.conversion_value || 0) - (b.spend || 0);
      } else {
        aValue = a[sortField] || 0;
        bValue = b[sortField] || 0;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      
      return sortOrder === 'asc' 
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
  }, [currentData, sortField, sortOrder]);

  const filteredData = useMemo(() => {
    return sortedData.filter((item: any) =>
      item.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sortedData, searchQuery]);

  const toggleItemSelection = (itemId: string, item?: any) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
        // Also remove from hierarchy selection
        if (item && viewLevel === 'campaign') {
          setSelectedCampaignIds(prevIds => {
            const ids = new Set(prevIds);
            ids.delete(item.campaign_id);
            return ids;
          });
        } else if (item && viewLevel === 'adset') {
          setSelectedAdsetIds(prevIds => {
            const ids = new Set(prevIds);
            ids.delete(item.adset_id);
            return ids;
          });
        }
      } else {
        newSet.add(itemId);
        // Also add to hierarchy selection for filtering
        if (item && viewLevel === 'campaign') {
          setSelectedCampaignIds(prevIds => {
            const ids = new Set(prevIds);
            ids.add(item.campaign_id);
            return ids;
          });
        } else if (item && viewLevel === 'adset') {
          setSelectedAdsetIds(prevIds => {
            const ids = new Set(prevIds);
            ids.add(item.adset_id);
            return ids;
          });
        }
      }
      return newSet;
    });
  };

  const toggleAllItems = () => {
    if (selectedItems.size === filteredData.length) {
      setSelectedItems(new Set());
      // Clear hierarchy selection when deselecting all
      if (viewLevel === 'campaign') {
        setSelectedCampaignIds(new Set());
      } else if (viewLevel === 'adset') {
        setSelectedAdsetIds(new Set());
      }
    } else {
      setSelectedItems(new Set(filteredData.map((item: any) => item.id)));
      // Add all to hierarchy selection
      if (viewLevel === 'campaign') {
        setSelectedCampaignIds(new Set(filteredData.map((item: any) => item.campaign_id)));
      } else if (viewLevel === 'adset') {
        setSelectedAdsetIds(new Set(filteredData.map((item: any) => item.adset_id)));
      }
    }
  };

  // Sync selectedItems with hierarchy selection when view level changes
  useEffect(() => {
    if (viewLevel === 'campaign') {
      // Restore campaign selection based on selectedCampaignIds
      const campaignItems = campaigns.filter(c => selectedCampaignIds.has(c.campaign_id)).map(c => c.id);
      setSelectedItems(new Set(campaignItems));
    } else if (viewLevel === 'adset') {
      // Restore adset selection based on selectedAdsetIds
      const adsetItems = filteredAdsetsByHierarchy.filter(a => selectedAdsetIds.has(a.adset_id)).map(a => a.id);
      setSelectedItems(new Set(adsetItems));
    } else {
      // For ads, clear selection
      setSelectedItems(new Set());
    }
  }, [viewLevel, selectedCampaignIds, selectedAdsetIds, campaigns, filteredAdsetsByHierarchy]);

  // Toggle campaign selection for hierarchy filtering
  const toggleCampaignHierarchySelection = (campaignId: string) => {
    setSelectedCampaignIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(campaignId)) {
        newSet.delete(campaignId);
      } else {
        newSet.add(campaignId);
      }
      return newSet;
    });
    // Clear adset selection when campaign selection changes
    setSelectedAdsetIds(new Set());
  };

  // Toggle adset selection for hierarchy filtering
  const toggleAdsetHierarchySelection = (adsetId: string) => {
    setSelectedAdsetIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(adsetId)) {
        newSet.delete(adsetId);
      } else {
        newSet.add(adsetId);
      }
      return newSet;
    });
  };

  // Clear all hierarchy selections
  const clearHierarchySelection = () => {
    setSelectedCampaignIds(new Set());
    setSelectedAdsetIds(new Set());
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50 hover:bg-green-500/30 text-xs px-2 py-0.5 w-fit">Ativo</Badge>;
      case "PAUSED":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 text-xs px-2 py-0.5 w-fit">Pausado</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs px-2 py-0.5 w-fit">{status}</Badge>;
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const formatCurrency = (value: number) => `R$ ${(value || 0).toFixed(2)}`;
  const formatNumber = (value: number) => (value || 0).toLocaleString('pt-BR');
  const formatPercent = (value: number) => `${(value || 0).toFixed(2)}%`;

  const currentColumns = viewLevel === 'ad' ? adColumns : columns;
  const visibleColumns = currentColumns.filter(col => col.visible);

  const rowVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.98, filter: "blur(4px)" },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: { type: "spring" as const, stiffness: 400, damping: 25, mass: 0.7 },
    },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } }
  };

  const renderCellContent = (item: any, columnKey: string) => {
    // Calculate profit using real sales data
    const adId = item.ad_id;
    const campaignId = item.campaign_id;
    const realValue = adId && salesByAd[adId] 
      ? salesByAd[adId].value 
      : campaignId && salesByCampaign[campaignId]
        ? salesByCampaign[campaignId].value
        : 0;
    const profit = realValue - (item.spend || 0);
    
    switch (columnKey) {
      case 'thumbnail':
        return item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" className="w-10 h-10 object-cover rounded" />
        ) : (
          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-muted-foreground text-[10px]">N/A</div>
        );
      case 'name':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium truncate max-w-[160px] text-sm">{item.name}</span>
            {getStatusBadge(item.status)}
          </div>
        );
      case 'daily_budget':
        const hasBudget = viewLevel !== 'ad';
        if (!hasBudget) return '-';
        return (
          <div className="flex items-center gap-0.5 justify-end">
            <span className="font-medium text-sm">{formatCurrency(item.daily_budget)}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-4 w-4"
              onClick={(e) => {
                e.stopPropagation();
                if (viewLevel === 'campaign') {
                  setSelectedCampaign(item);
                  setSelectedAdset(null);
                } else {
                  setSelectedAdset(item);
                  setSelectedCampaign(null);
                }
                setNewBudget(item.daily_budget?.toString() || "");
                setEditBudgetDialogOpen(true);
              }}
            >
              <Pencil className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
            </Button>
          </div>
        );
      case 'spend':
        return <span className="text-red-400 font-medium text-sm">{formatCurrency(item.spend)}</span>;
      case 'impressions':
        return <span className="text-sm">{formatNumber(item.impressions)}</span>;
      case 'reach':
        return <span className="text-sm">{formatNumber(item.reach || 0)}</span>;
      case 'cpm':
        return <span className="text-sm">{formatCurrency(item.cpm)}</span>;
      case 'cpc':
        return <span className="text-sm">{formatCurrency(item.cpc || 0)}</span>;
      case 'ctr':
        return <span className="text-sm">{formatPercent(item.ctr)}</span>;
      case 'cost_per_message':
        return <span className="text-sm">{formatCurrency(item.cost_per_message || 0)}</span>;
      case 'messaging_conversations_started':
        return <span className="text-sm">{formatNumber(item.messaging_conversations_started || 0)}</span>;
      case 'meta_conversions':
        // Use real sales from ads_whatsapp_leads
        const adId = item.ad_id;
        const campaignId = item.campaign_id;
        const salesCount = adId && salesByAd[adId] 
          ? salesByAd[adId].count 
          : campaignId && salesByCampaign[campaignId]
            ? salesByCampaign[campaignId].count
            : 0;
        return <span className="font-medium text-green-400 text-sm">{formatNumber(salesCount)}</span>;
      case 'conversion_value':
        // Use real revenue from ads_whatsapp_leads
        const adIdVal = item.ad_id;
        const campaignIdVal = item.campaign_id;
        const salesValue = adIdVal && salesByAd[adIdVal] 
          ? salesByAd[adIdVal].value 
          : campaignIdVal && salesByCampaign[campaignIdVal]
            ? salesByCampaign[campaignIdVal].value
            : 0;
        return <span className="font-medium text-blue-400 text-sm">{formatCurrency(salesValue)}</span>;
      case 'profit':
        return <span className={cn("font-medium text-sm", profit >= 0 ? "text-green-400" : "text-red-400")}>{formatCurrency(profit)}</span>;
      default:
        return null;
    }
  };

  const handleToggleItem = (item: any) => {
    if (viewLevel === 'campaign') {
      handleToggleCampaign(item);
    } else if (viewLevel === 'adset') {
      handleToggleAdset(item);
    } else {
      handleToggleAd(item);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground">Gerencie suas campanhas de anúncios</p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar..."
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Selecionar período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="7days">Últimos 7 dias</SelectItem>
              <SelectItem value="30days">Últimos 30 dias</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Multi-select account filter */}
        <Popover open={accountFilterOpen} onOpenChange={setAccountFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[220px] justify-between">
              {selectedAccounts.length === 0 
                ? "Todas as contas" 
                : `${selectedAccounts.length} conta${selectedAccounts.length > 1 ? 's' : ''} selecionada${selectedAccounts.length > 1 ? 's' : ''}`
              }
              <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2" align="end">
            <div className="space-y-1">
              <button
                onClick={() => setSelectedAccounts([])}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted",
                  selectedAccounts.length === 0 && "bg-orange-500/10 text-orange-400"
                )}
              >
                {selectedAccounts.length === 0 && <Check className="h-4 w-4" />}
                <span className={selectedAccounts.length === 0 ? "" : "ml-6"}>Todas as contas</span>
              </button>
              <div className="border-t border-border my-2" />
              {activeAdAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => toggleAccountSelection(acc.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted",
                    selectedAccounts.includes(acc.id) && "bg-orange-500/10 text-orange-400"
                  )}
                >
                  <Checkbox 
                    checked={selectedAccounts.includes(acc.id)}
                    className="border-orange-500 data-[state=checked]:bg-orange-500 data-[state=checked]:text-white"
                  />
                  <span className="truncate">{acc.name || acc.ad_account_id}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Column visibility dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon">
              <Columns3 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-2">
              <p className="text-sm font-medium mb-3">Colunas visíveis</p>
              {currentColumns.map(col => (
                <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                  <Checkbox 
                    checked={col.visible} 
                    onCheckedChange={() => toggleColumnVisibility(col.key)} 
                  />
                  <span className="text-sm">{col.label}</span>
                  {col.visible ? <Eye className="h-3 w-3 ml-auto text-muted-foreground" /> : <EyeOff className="h-3 w-3 ml-auto text-muted-foreground" />}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Bulk Actions */}
      <AnimatePresence>
        {selectedItems.size > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg"
          >
            <Badge variant="secondary" className="bg-orange-500 text-white">
              {selectedItems.size} selecionado{selectedItems.size > 1 ? 's' : ''}
            </Badge>
            
            <div className="flex items-center gap-2 ml-auto">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkToggle(true)}
                className="gap-1"
              >
                <Play className="h-3 w-3" />
                Ativar
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkToggle(false)}
                className="gap-1"
              >
                <Pause className="h-3 w-3" />
                Pausar
              </Button>
              {viewLevel !== 'ad' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setBulkBudgetDialogOpen(true)}
                  className="gap-1"
                >
                  <DollarSign className="h-3 w-3" />
                  Alterar Orçamento
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedItems(new Set())}
              >
                Limpar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Level Tabs with hierarchy selection info */}
      <div className="border-b border-border">
        <div className="flex justify-between items-center">
          <div className="flex gap-0">
            {viewLevelTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setViewLevel(tab.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  viewLevel === tab.value
                    ? "border-orange-500 text-orange-400 bg-orange-500/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <Badge variant="secondary" className="ml-1 text-xs">
                  {tab.value === 'campaign' ? campaignCount : tab.value === 'adset' ? adsetCount : adCount}
                </Badge>
              </button>
            ))}
          </div>
          
          {/* Hierarchy selection indicator */}
          {(selectedCampaignIds.size > 0 || selectedAdsetIds.size > 0) && (
            <div className="flex items-center gap-2 pr-4">
              <span className="text-xs text-muted-foreground">
                Filtro: {selectedCampaignIds.size > 0 && `${selectedCampaignIds.size} campanha(s)`}
                {selectedAdsetIds.size > 0 && ` → ${selectedAdsetIds.size} conjunto(s)`}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearHierarchySelection}
                className="h-6 text-xs"
              >
                Limpar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card/50 backdrop-blur">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">
              {viewLevel === 'campaign' ? 'Nenhuma campanha encontrada' : 
               viewLevel === 'adset' ? 'Nenhum conjunto de anúncios encontrado' : 
               'Nenhum anúncio encontrado'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Clique em sincronizar para buscar dados do Facebook
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[40px] border-r border-border/30">
                    <Checkbox
                      checked={selectedItems.size === filteredData.length && filteredData.length > 0}
                      onCheckedChange={toggleAllItems}
                      className="border-orange-500 data-[state=checked]:bg-orange-500 data-[state=checked]:text-white"
                    />
                  </TableHead>
                  <TableHead 
                    className="w-[60px] border-r border-border/30 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-1">
                      On/Off
                      {sortField === 'status' && (
                        sortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </TableHead>
                  {visibleColumns.map((col) => {
                    const width = getColumnWidth(col);
                    return (
                      <TableHead 
                        key={col.key}
                        className={cn(
                          "cursor-pointer hover:text-foreground relative group border-r border-border/30 transition-all duration-150",
                          col.key !== 'name' && col.key !== 'thumbnail' && "text-right"
                        )}
                        style={{ minWidth: width, width: width }}
                        onClick={() => col.key !== 'thumbnail' && handleSort(col.key as SortField)}
                      >
                        <div className={cn("flex items-center", col.key !== 'name' && col.key !== 'thumbnail' && "justify-end")}>
                          {col.label} {col.key !== 'thumbnail' && <SortIcon field={col.key as SortField} />}
                        </div>
                        {/* Resize handle */}
                        <div 
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-orange-500/50 transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const startX = e.clientX;
                            const startWidth = width;
                            
                            const handleMouseMove = (moveE: MouseEvent) => {
                              moveE.preventDefault();
                              const delta = moveE.clientX - startX;
                              const newWidth = startWidth + delta * 0.5;
                              handleColumnResize(col.key, newWidth);
                            };
                            
                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                              document.body.style.cursor = '';
                              document.body.style.userSelect = '';
                            };
                            
                            document.body.style.cursor = 'col-resize';
                            document.body.style.userSelect = 'none';
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                        />
                      </TableHead>
                    );
                  })}
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {filteredData.map((item: any, index: number) => {
                    return (
                      <motion.tr 
                        key={item.id}
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        style={{ animationDelay: `${index * 0.04}s` }}
                        className={cn(
                          "border-b border-border/20 hover:bg-muted/20 transition-colors",
                          selectedItems.has(item.id) && "bg-orange-500/5"
                        )}
                      >
                        <TableCell className="border-r border-border/20">
                          <Checkbox
                            checked={selectedItems.has(item.id)}
                            onCheckedChange={() => toggleItemSelection(item.id, item)}
                            className="border-orange-500 data-[state=checked]:bg-orange-500 data-[state=checked]:text-white"
                          />
                        </TableCell>
                        <TableCell className="border-r border-border/20">
                          <Switch
                            checked={item.status === "ACTIVE"}
                            onCheckedChange={() => handleToggleItem(item)}
                            className={cn(
                              "data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500",
                              "[&>span]:bg-white"
                            )}
                          />
                        </TableCell>
                        {visibleColumns.map((col) => (
                          <TableCell 
                            key={col.key}
                            className={cn(
                              "border-r border-border/20",
                              col.key !== 'name' && col.key !== 'thumbnail' && "text-right"
                            )}
                            style={{ minWidth: getColumnWidth(col), width: getColumnWidth(col) }}
                          >
                            {renderCellContent(item, col.key)}
                          </TableCell>
                        ))}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleToggleItem(item)}>
                                {item.status === "ACTIVE" ? (
                                  <>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Pausar
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Ativar
                                  </>
                                )}
                              </DropdownMenuItem>
                              {viewLevel !== 'ad' && (
                                <DropdownMenuItem onClick={() => {
                                  if (viewLevel === 'campaign') {
                                    setSelectedCampaign(item);
                                    setSelectedAdset(null);
                                  } else {
                                    setSelectedAdset(item);
                                    setSelectedCampaign(null);
                                  }
                                  setNewBudget(item.daily_budget?.toString() || "");
                                  setEditBudgetDialogOpen(true);
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar Orçamento
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Budget Dialog */}
      <Dialog open={editBudgetDialogOpen} onOpenChange={setEditBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Orçamento Diário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Novo Orçamento (R$)</Label>
              <Input
                type="number"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                placeholder="50.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBudgetDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateBudget}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Budget Dialog */}
      <Dialog open={bulkBudgetDialogOpen} onOpenChange={setBulkBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Orçamento em Massa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Alterando orçamento de {selectedItems.size} item(s)
            </p>
            <div className="space-y-2">
              <Label>Novo Orçamento Diário (R$)</Label>
              <Input
                type="number"
                value={bulkNewBudget}
                onChange={(e) => setBulkNewBudget(e.target.value)}
                placeholder="50.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkBudgetDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleBulkBudgetUpdate}>
              Aplicar a Todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
