import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Plus, 
  RefreshCcw, 
  Search, 
  DollarSign,
  Eye,
  MousePointerClick,
  Target,
  MoreVertical,
  Edit,
  Pause,
  Play,
  Trash2
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";

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
}

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
      const { error } = await supabase.functions.invoke("ads-sync-campaigns");
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

  const handleToggleCampaign = async (campaign: Campaign) => {
    const newStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    
    try {
      const { error } = await supabase.functions.invoke("ads-update-campaign", {
        body: {
          campaign_id: campaign.campaign_id,
          ad_account_id: campaign.ad_account_id,
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
      const { error } = await supabase.functions.invoke("ads-update-campaign", {
        body: {
          campaign_id: selectedCampaign.campaign_id,
          ad_account_id: selectedCampaign.ad_account_id,
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
      const { error } = await supabase.functions.invoke("ads-create-campaign", {
        body: {
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

  const filteredCampaigns = campaigns.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Ativa</Badge>;
      case "PAUSED":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">Pausada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
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

      {/* Campaigns List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : filteredCampaigns.length === 0 ? (
          <Card className="bg-card/50">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nenhuma campanha encontrada</p>
            </CardContent>
          </Card>
        ) : (
          filteredCampaigns.map((campaign, index) => (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Campaign Info */}
                    <div className="flex items-center gap-4 flex-1">
                      <Switch
                        checked={campaign.status === "ACTIVE"}
                        onCheckedChange={() => handleToggleCampaign(campaign)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium truncate">{campaign.name}</h3>
                          {getStatusBadge(campaign.status)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Orçamento: R$ {(campaign.daily_budget || 0).toFixed(2)}/dia
                        </p>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Gasto</p>
                        <p className="font-medium text-red-400">R$ {(campaign.spend || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Impressões</p>
                        <p className="font-medium">{(campaign.impressions || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Cliques</p>
                        <p className="font-medium">{campaign.clicks || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">CPM</p>
                        <p className="font-medium">R$ {(campaign.cpm || 0).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
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
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Edit Budget Dialog */}
      <Dialog open={editBudgetDialogOpen} onOpenChange={setEditBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Orçamento</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Novo Orçamento Diário (R$)</Label>
            <Input
              type="number"
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
              placeholder="50.00"
              className="mt-2"
            />
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
