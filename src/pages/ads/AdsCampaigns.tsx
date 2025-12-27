import { useState, useEffect } from "react";
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
  Calendar
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";
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
}

type SortField = 'name' | 'status' | 'daily_budget' | 'spend' | 'impressions' | 'reach' | 'cpm' | 'cpc' | 'ctr' | 'cost_per_message' | 'messaging_conversations_started' | 'meta_conversions';
type SortOrder = 'asc' | 'desc';
type DateFilter = "today" | "yesterday" | "7days" | "30days" | "month";

export default function AdsCampaigns() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editBudgetDialogOpen, setEditBudgetDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [newBudget, setNewBudget] = useState("");
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('spend');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days");

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

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedAccount]);

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

      // Load campaigns
      let query = supabase
        .from("ads_campaigns")
        .select("*")
        .eq("user_id", user.id)
        .order("spend", { ascending: false });

      if (selectedAccount !== "all") {
        query = query.eq("ad_account_id", selectedAccount);
      }

      const { data: campaignsData } = await query;
      setCampaigns(campaignsData || []);
    } catch (error) {
      console.error("Error loading campaigns:", error);
    } finally {
      setLoading(false);
    }
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
      splashedToast.success("Campanhas sincronizadas!");
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

  const handleUpdateBudget = async () => {
    if (!selectedCampaign || !newBudget) return;

    try {
      const { error } = await supabase.functions.invoke("facebook-campaigns", {
        body: {
          action: "update_campaign_budget",
          campaignId: selectedCampaign.campaign_id,
          adAccountId: selectedCampaign.ad_account_id,
          daily_budget: parseFloat(newBudget) * 100 // Convert to cents
        }
      });

      if (error) throw error;

      setCampaigns(prev => prev.map(c => 
        c.id === selectedCampaign.id ? { ...c, daily_budget: parseFloat(newBudget) } : c
      ));

      setEditBudgetDialogOpen(false);
      setNewBudget("");
      setSelectedCampaign(null);
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

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const aValue = a[sortField] || 0;
    const bValue = b[sortField] || 0;
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortOrder === 'asc' 
        ? aValue.localeCompare(bValue) 
        : bValue.localeCompare(aValue);
    }
    
    return sortOrder === 'asc' 
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  });

  const filteredCampaigns = sortedCampaigns.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCampaignSelection = (campaignId: string) => {
    setSelectedCampaigns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(campaignId)) {
        newSet.delete(campaignId);
      } else {
        newSet.add(campaignId);
      }
      return newSet;
    });
  };

  const toggleAllCampaigns = () => {
    if (selectedCampaigns.size === filteredCampaigns.length) {
      setSelectedCampaigns(new Set());
    } else {
      setSelectedCampaigns(new Set(filteredCampaigns.map(c => c.id)));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50 hover:bg-green-500/30 text-xs px-2 py-0.5 w-fit">Ativa</Badge>;
      case "PAUSED":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30 text-xs px-2 py-0.5 w-fit">Pausada</Badge>;
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground">Gerencie suas campanhas de anúncios</p>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar Nova Campanha</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da Campanha</Label>
                  <Input
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Campanha WhatsApp Dezembro"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Objetivo</Label>
                  <Select 
                    value={newCampaign.objective} 
                    onValueChange={(v) => setNewCampaign(prev => ({ ...prev, objective: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MESSAGES">Mensagens</SelectItem>
                      <SelectItem value="CONVERSIONS">Conversões</SelectItem>
                      <SelectItem value="LINK_CLICKS">Cliques no Link</SelectItem>
                      <SelectItem value="REACH">Alcance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Orçamento Diário (R$)</Label>
                  <Input
                    type="number"
                    value={newCampaign.daily_budget}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, daily_budget: e.target.value }))}
                    placeholder="50.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Contas de Anúncio</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Selecione as contas onde a campanha será criada
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {adAccounts.map(acc => (
                      <label 
                        key={acc.id} 
                        className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={newCampaign.selected_accounts.includes(acc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewCampaign(prev => ({
                                ...prev,
                                selected_accounts: [...prev.selected_accounts, acc.id]
                              }));
                            } else {
                              setNewCampaign(prev => ({
                                ...prev,
                                selected_accounts: prev.selected_accounts.filter(id => id !== acc.id)
                              }));
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{acc.name || acc.ad_account_id}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateCampaign}>
                  Criar Campanha{newCampaign.selected_accounts.length > 1 ? "s" : ""}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar campanhas..."
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
        
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger className="w-[200px]">
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
      </div>

      {/* Selected count */}
      {selectedCampaigns.size > 0 && (
        <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded-lg text-sm">
          <Badge variant="secondary" className="bg-primary text-primary-foreground">
            {selectedCampaigns.size} selecionada{selectedCampaigns.size > 1 ? 's' : ''}
          </Badge>
        </div>
      )}

      {/* Campaigns Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card/50 backdrop-blur">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">Nenhuma campanha encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={selectedCampaigns.size === filteredCampaigns.length && filteredCampaigns.length > 0}
                      onCheckedChange={toggleAllCampaigns}
                    />
                  </TableHead>
                  <TableHead className="w-[60px]">On/Off</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground min-w-[200px]"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">
                      Nome <SortIcon field="name" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('daily_budget')}
                  >
                    <div className="flex items-center justify-end">
                      Orçamento <SortIcon field="daily_budget" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('spend')}
                  >
                    <div className="flex items-center justify-end">
                      Valor Usado <SortIcon field="spend" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('impressions')}
                  >
                    <div className="flex items-center justify-end">
                      Impressões <SortIcon field="impressions" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('reach')}
                  >
                    <div className="flex items-center justify-end">
                      Alcance <SortIcon field="reach" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('cpm')}
                  >
                    <div className="flex items-center justify-end">
                      CPM <SortIcon field="cpm" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('cpc')}
                  >
                    <div className="flex items-center justify-end">
                      CPC (link) <SortIcon field="cpc" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('ctr')}
                  >
                    <div className="flex items-center justify-end">
                      CTR (link) <SortIcon field="ctr" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('cost_per_message')}
                  >
                    <div className="flex items-center justify-end">
                      Custo/Msg <SortIcon field="cost_per_message" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('messaging_conversations_started')}
                  >
                    <div className="flex items-center justify-end">
                      Conversas <SortIcon field="messaging_conversations_started" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('meta_conversions')}
                  >
                    <div className="flex items-center justify-end">
                      Conversão <SortIcon field="meta_conversions" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => (
                  <TableRow 
                    key={campaign.id}
                    className={cn(
                      "hover:bg-muted/50",
                      selectedCampaigns.has(campaign.id) && "bg-primary/5"
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedCampaigns.has(campaign.id)}
                        onCheckedChange={() => toggleCampaignSelection(campaign.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={campaign.status === "ACTIVE"}
                        onCheckedChange={() => handleToggleCampaign(campaign)}
                        className={cn(
                          "data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500",
                          "[&>span]:bg-white"
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium truncate max-w-[200px]">{campaign.name}</span>
                        {getStatusBadge(campaign.status)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(campaign.daily_budget)}
                      <span className="text-xs text-muted-foreground">/dia</span>
                    </TableCell>
                    <TableCell className="text-right text-red-400 font-medium">
                      {formatCurrency(campaign.spend)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(campaign.impressions)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(campaign.reach || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(campaign.cpm)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(campaign.cpc || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(campaign.ctr)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(campaign.cost_per_message || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(campaign.messaging_conversations_started || 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-400">
                      {formatNumber(campaign.meta_conversions || 0)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedCampaign(campaign);
                            setNewBudget(campaign.daily_budget?.toString() || "");
                            setEditBudgetDialogOpen(true);
                          }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar Orçamento
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleCampaign(campaign)}>
                            {campaign.status === "ACTIVE" ? (
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Budget Dialog */}
      <Dialog open={editBudgetDialogOpen} onOpenChange={setEditBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Orçamento</DialogTitle>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Campanha: <span className="font-medium text-foreground">{selectedCampaign?.name}</span>
            </p>
            <div className="space-y-2">
              <Label>Novo Orçamento Diário (R$)</Label>
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
    </div>
  );
}
