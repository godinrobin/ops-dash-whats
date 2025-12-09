import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, TrendingUp, TrendingDown, Minus, ExternalLink, Trash2, Edit, Maximize2, Calendar, Save } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, parseISO, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TrackedOffer {
  id: string;
  name: string;
  ad_library_link: string;
  created_at: string;
}

interface OfferMetric {
  id?: string;
  date: string;
  active_ads_count: number;
  is_invalid_link: boolean;
}

const TrackOfertas = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [offers, setOffers] = useState<TrackedOffer[]>([]);
  const [allMetrics, setAllMetrics] = useState<Record<string, OfferMetric[]>>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [newOffer, setNewOffer] = useState({ name: "", ad_library_link: "" });
  const [expandedOffer, setExpandedOffer] = useState<TrackedOffer | null>(null);
  const [editingOffer, setEditingOffer] = useState<TrackedOffer | null>(null);
  const [editedOfferName, setEditedOfferName] = useState("");
  
  // Estados para edição manual de métricas
  const [editingMetricOffer, setEditingMetricOffer] = useState<TrackedOffer | null>(null);
  const [editingDate, setEditingDate] = useState("");
  const [editingValue, setEditingValue] = useState("");

  useEffect(() => {
    if (user) {
      loadOffers();
    }
  }, [user]);

  useEffect(() => {
    if (offers.length > 0) {
      loadAllMetrics();
    }
  }, [offers]);

  const loadOffers = async () => {
    setIsInitialLoading(true);
    const { data, error } = await supabase
      .from("tracked_offers")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Erro ao carregar ofertas",
        description: error.message,
        variant: "destructive",
      });
      setIsInitialLoading(false);
      return;
    }

    setOffers(data || []);
    setIsInitialLoading(false);
  };

  const loadAllMetrics = async () => {
    const metricsData: Record<string, OfferMetric[]> = {};
    
    for (const offer of offers) {
      const { data, error } = await supabase
        .from("offer_metrics")
        .select("*")
        .eq("offer_id", offer.id)
        .order("date", { ascending: true });

      if (!error && data) {
        metricsData[offer.id] = data;
      }
    }
    
    setAllMetrics(metricsData);
  };

  const getTodayDate = () => {
    return format(new Date(), "dd/MM");
  };

  const handleAddOffer = async () => {
    if (!newOffer.name || !newOffer.ad_library_link) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha o nome e o link da oferta.",
        variant: "destructive",
      });
      return;
    }

    // Validate Facebook Ad Library link
    const link = newOffer.ad_library_link.trim();
    if (!link.includes('facebook.com/ads/library')) {
      toast({
        title: "Link inválido",
        description: "O link deve ser da Biblioteca de Anúncios do Facebook.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error: offerError } = await supabase
        .from("tracked_offers")
        .insert([{
          user_id: user?.id,
          name: newOffer.name,
          ad_library_link: newOffer.ad_library_link,
        }]);

      if (offerError) throw offerError;

      toast({
        title: "Oferta cadastrada!",
        description: "Agora você pode inserir os dados de anúncios manualmente.",
      });

      setNewOffer({ name: "", ad_library_link: "" });
      setIsDialogOpen(false);
      loadOffers();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao processar sua solicitação.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditOffer = async () => {
    if (!editingOffer || !editedOfferName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, preencha o nome da oferta.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("tracked_offers")
        .update({ name: editedOfferName.trim() })
        .eq("id", editingOffer.id);

      if (error) throw error;

      toast({
        title: "Oferta atualizada!",
        description: "O nome da oferta foi atualizado com sucesso.",
      });

      setEditingOffer(null);
      setEditedOfferName("");
      loadOffers();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar oferta",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteOffer = async (offerId: string) => {
    const { error } = await supabase
      .from("tracked_offers")
      .delete()
      .eq("id", offerId);

    if (error) {
      toast({
        title: "Erro ao excluir oferta",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Oferta excluída",
      description: "A oferta foi removida com sucesso.",
    });

    loadOffers();
  };

  const handleSaveMetric = async (offerId: string, date: string, value: number) => {
    try {
      // Check if metric already exists for this date
      const { data: existingMetric } = await supabase
        .from("offer_metrics")
        .select("id")
        .eq("offer_id", offerId)
        .eq("date", date)
        .maybeSingle();

      if (existingMetric) {
        // Update existing metric
        const { error } = await supabase
          .from("offer_metrics")
          .update({ active_ads_count: value })
          .eq("id", existingMetric.id);

        if (error) throw error;
      } else {
        // Insert new metric
        const { error } = await supabase
          .from("offer_metrics")
          .insert([{
            offer_id: offerId,
            date: date,
            active_ads_count: value,
            is_invalid_link: false,
          }]);

        if (error) throw error;
      }

      toast({
        title: "Métrica salva!",
        description: `Anúncios do dia ${date} atualizados com sucesso.`,
      });

      loadAllMetrics();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar métrica",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getCurrentCount = (metrics: OfferMetric[]) => {
    if (metrics.length === 0) return 0;
    return metrics[metrics.length - 1].active_ads_count;
  };

  const getVariation = (metrics: OfferMetric[]) => {
    if (metrics.length < 2) return { type: "neutral" as const, value: 0 };
    const current = metrics[metrics.length - 1].active_ads_count;
    const previous = metrics[metrics.length - 2].active_ads_count;
    const diff = current - previous;
    
    if (diff > 0) return { type: "up" as const, value: diff };
    if (diff < 0) return { type: "down" as const, value: Math.abs(diff) };
    return { type: "neutral" as const, value: 0 };
  };

  const getTodayMetric = (metrics: OfferMetric[]) => {
    const today = getTodayDate();
    return metrics.find(m => m.date === today);
  };

  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      days.push(format(date, "dd/MM"));
    }
    return days;
  };

  return (
    <div className="min-h-screen bg-background relative">
      <Header />
      
      {/* Loading inicial */}
      <Dialog open={isInitialLoading}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border text-center">
          <DialogHeader>
            <DialogTitle className="sr-only">Carregando ofertas</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-accent border-t-transparent"></div>
            <p className="text-lg font-medium text-foreground">Carregando ofertas...</p>
          </div>
        </DialogContent>
      </Dialog>

      <main className="container mx-auto px-4 pt-20 pb-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
              Track Ofertas
            </h2>
            <p className="text-muted-foreground mb-3">
              Acompanhe a performance dos anúncios ativos das suas ofertas
            </p>
          </div>
          
          <div className="flex gap-3">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="lg" 
                  className="bg-accent hover:bg-accent/90"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Adicionar Oferta
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-2xl">Cadastrar Nova Oferta</DialogTitle>
                <DialogDescription>
                  Preencha os dados abaixo para começar a rastrear uma nova oferta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-base">Nome da Oferta *</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Produto XYZ - Campanha Verão"
                    value={newOffer.name}
                    onChange={(e) => setNewOffer({ ...newOffer, name: e.target.value })}
                    className="bg-input border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Escolha um nome descritivo para identificar facilmente sua oferta
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link" className="text-base">Link da Biblioteca de Anúncios *</Label>
                  <Input
                    id="link"
                    placeholder="https://www.facebook.com/ads/library/?id=..."
                    value={newOffer.ad_library_link}
                    onChange={(e) => setNewOffer({ ...newOffer, ad_library_link: e.target.value })}
                    className="bg-input border-border"
                  />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>✅ Use o link de uma <strong>página específica</strong> (com "view_all_page_id=")</p>
                    <p>❌ Não use links de busca por palavras-chave</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setNewOffer({ name: "", ad_library_link: "" });
                  }}
                  className="flex-1"
                  disabled={isLoading}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleAddOffer}
                  disabled={isLoading}
                  className="flex-1 bg-accent hover:bg-accent/90"
                >
                  {isLoading ? "Cadastrando..." : "Cadastrar Oferta"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {offers.length === 0 ? (
          <Card className="border-border bg-card/50 backdrop-blur">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-accent/10 p-6 mb-4">
                <Plus className="h-12 w-12 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Nenhuma oferta cadastrada</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Comece cadastrando sua primeira oferta para acompanhar a performance dos anúncios ativos.
              </p>
              <Button 
                onClick={() => setIsDialogOpen(true)}
                size="lg"
                className="bg-accent hover:bg-accent/90"
              >
                <Plus className="mr-2 h-5 w-5" />
                Cadastrar Primeira Oferta
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {offers.map((offer) => {
                const metrics = allMetrics[offer.id] || [];
                const variation = getVariation(metrics);
                const todayMetric = getTodayMetric(metrics);
                
                return (
                  <Card key={offer.id} className="border-border bg-card/50 backdrop-blur relative group">
                      <CardHeader className="pb-2 px-3 pt-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-semibold truncate flex-1">{offer.name}</CardTitle>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-blue-500/20"
                              onClick={() => {
                                setEditingOffer(offer);
                                setEditedOfferName(offer.name);
                              }}
                            >
                              <Edit className="h-3 w-3 text-blue-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-accent/20"
                              onClick={() => setExpandedOffer(offer)}
                            >
                              <Maximize2 className="h-3 w-3 text-accent" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-destructive/20"
                              onClick={() => {
                                if (confirm(`Deseja realmente excluir a oferta "${offer.name}"?`)) {
                                  handleDeleteOffer(offer.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <CardDescription className="flex items-center gap-1 text-xs">
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          <a 
                            href={offer.ad_library_link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hover:text-accent transition-colors truncate"
                          >
                            Ver anúncios
                          </a>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-3 pb-3">
                        {/* Input para adicionar métrica do dia */}
                        <div className="mb-3 p-2 bg-secondary/50 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="h-4 w-4 text-accent" />
                            <span className="text-xs font-medium">Hoje ({getTodayDate()})</span>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="Qtd anúncios"
                              className="h-8 text-sm"
                              defaultValue={todayMetric?.active_ads_count || ""}
                              onBlur={(e) => {
                                if (e.target.value) {
                                  handleSaveMetric(offer.id, getTodayDate(), parseInt(e.target.value));
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                                  handleSaveMetric(offer.id, getTodayDate(), parseInt((e.target as HTMLInputElement).value));
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2"
                              onClick={() => {
                                setEditingMetricOffer(offer);
                                setEditingDate("");
                                setEditingValue("");
                              }}
                            >
                              <Calendar className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="h-[100px] mb-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={metrics}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                              <XAxis 
                                dataKey="date" 
                                stroke="hsl(var(--muted-foreground))"
                                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                                height={20}
                              />
                              <YAxis 
                                stroke="hsl(var(--muted-foreground))"
                                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                                width={25}
                              />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: "hsl(var(--card))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  padding: "4px 8px",
                                }}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="active_ads_count" 
                                stroke="hsl(var(--accent))" 
                                strokeWidth={2}
                                dot={{ fill: "hsl(var(--accent))", r: 2 }}
                                name="Anúncios"
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Card className="border-border bg-secondary/50">
                            <CardHeader className="pb-1 px-2 pt-2">
                              <CardTitle className="text-[10px] font-medium text-muted-foreground">
                                Variação
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pb-2 px-2">
                              <div className="flex items-center gap-1">
                                {variation.type === "up" && (
                                  <>
                                    <div className="rounded-full bg-positive/10 p-1">
                                      <TrendingUp className="h-3 w-3 text-positive" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-positive">+{variation.value}</p>
                                    </div>
                                  </>
                                )}
                                {variation.type === "down" && (
                                  <>
                                    <div className="rounded-full bg-destructive/10 p-1">
                                      <TrendingDown className="h-3 w-3 text-destructive" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-destructive">-{variation.value}</p>
                                    </div>
                                  </>
                                )}
                                {variation.type === "neutral" && (
                                  <>
                                    <div className="rounded-full bg-muted/50 p-1">
                                      <Minus className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-muted-foreground">0</p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-border bg-secondary/50">
                            <CardHeader className="pb-1 px-2 pt-2">
                              <CardTitle className="text-[10px] font-medium text-muted-foreground">
                                Último Registro
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pb-2 px-2">
                              <div className="flex items-center gap-1">
                                <div className="rounded-full bg-accent/10 p-1">
                                  <span className="text-[10px] font-bold text-accent">📊</span>
                                </div>
                                <p className="text-sm font-bold text-foreground">{getCurrentCount(metrics)}</p>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
          </div>
        )}
      </main>

      {/* Dialog de Edição de Nome */}
      <Dialog open={!!editingOffer} onOpenChange={(open) => {
        if (!open) {
          setEditingOffer(null);
          setEditedOfferName("");
        }
      }}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-2xl">Editar Oferta</DialogTitle>
            <DialogDescription>
              Altere o nome da oferta conforme necessário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-base">Nome da Oferta *</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Produto XYZ - Campanha Verão"
                value={editedOfferName}
                onChange={(e) => setEditedOfferName(e.target.value)}
                className="bg-input border-border"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setEditingOffer(null);
                setEditedOfferName("");
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditOffer}
              className="flex-1 bg-accent hover:bg-accent/90"
            >
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição de Métrica de Dia Passado */}
      <Dialog open={!!editingMetricOffer} onOpenChange={(open) => {
        if (!open) {
          setEditingMetricOffer(null);
          setEditingDate("");
          setEditingValue("");
        }
      }}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-2xl">Editar Dia Anterior</DialogTitle>
            <DialogDescription>
              Preencha a quantidade de anúncios de um dia específico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-base">Selecione o dia</Label>
              <div className="grid grid-cols-4 gap-2">
                {getLast7Days().map((day) => (
                  <Button
                    key={day}
                    variant={editingDate === day ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditingDate(day)}
                    className={editingDate === day ? "bg-accent" : ""}
                  >
                    {day}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-value" className="text-base">Quantidade de Anúncios</Label>
              <Input
                id="edit-value"
                type="number"
                placeholder="Ex: 15"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                className="bg-input border-border"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setEditingMetricOffer(null);
                setEditingDate("");
                setEditingValue("");
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingMetricOffer && editingDate && editingValue) {
                  handleSaveMetric(editingMetricOffer.id, editingDate, parseInt(editingValue));
                  setEditingMetricOffer(null);
                  setEditingDate("");
                  setEditingValue("");
                } else {
                  toast({
                    title: "Campos obrigatórios",
                    description: "Selecione um dia e preencha a quantidade.",
                    variant: "destructive",
                  });
                }
              }}
              className="flex-1 bg-accent hover:bg-accent/90"
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup expandido */}
      <Dialog open={!!expandedOffer} onOpenChange={() => setExpandedOffer(null)}>
        <DialogContent className="sm:max-w-[90vw] md:max-w-[800px] bg-card border-2 border-accent">
          <DialogHeader>
            <DialogTitle className="text-2xl">{expandedOffer?.name}</DialogTitle>
            <DialogDescription className="flex items-center gap-2 mt-2">
              <ExternalLink className="h-4 w-4" />
              <a 
                href={expandedOffer?.ad_library_link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                Ver biblioteca de anúncios
              </a>
            </DialogDescription>
          </DialogHeader>
          
          {expandedOffer && allMetrics[expandedOffer.id] && (
            <div className="space-y-6 py-4">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={allMetrics[expandedOffer.id]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="active_ads_count" 
                      stroke="hsl(var(--accent))" 
                      strokeWidth={3}
                      dot={{ fill: "hsl(var(--accent))", r: 4 }}
                      name="Anúncios Ativos"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Tabela de histórico */}
              <div className="space-y-2">
                <h4 className="font-semibold">Histórico de Registros</h4>
                <div className="grid grid-cols-7 gap-2">
                  {getLast7Days().map((day) => {
                    const metric = allMetrics[expandedOffer.id]?.find(m => m.date === day);
                    return (
                      <div key={day} className="p-2 bg-secondary/50 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground">{day}</p>
                        <p className="text-lg font-bold">{metric?.active_ads_count ?? 0}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-border bg-secondary/50">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Variação vs. Dia Anterior
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const variation = getVariation(allMetrics[expandedOffer.id] || []);
                      return (
                        <div className="flex items-center gap-3">
                          {variation.type === "up" && (
                            <>
                              <div className="rounded-full bg-positive/10 p-3">
                                <TrendingUp className="h-6 w-6 text-positive" />
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-positive">+{variation.value}</p>
                                <p className="text-sm text-muted-foreground">Anúncios a mais</p>
                              </div>
                            </>
                          )}
                          {variation.type === "down" && (
                            <>
                              <div className="rounded-full bg-destructive/10 p-3">
                                <TrendingDown className="h-6 w-6 text-destructive" />
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-destructive">-{variation.value}</p>
                                <p className="text-sm text-muted-foreground">Anúncios a menos</p>
                              </div>
                            </>
                          )}
                          {variation.type === "neutral" && (
                            <>
                              <div className="rounded-full bg-muted/50 p-3">
                                <Minus className="h-6 w-6 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-muted-foreground">0</p>
                                <p className="text-sm text-muted-foreground">Sem variação</p>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                <Card className="border-border bg-secondary/50">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Último Registro
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-accent/10 p-3">
                        <span className="text-2xl">📊</span>
                      </div>
                      <p className="text-3xl font-bold text-foreground">
                        {getCurrentCount(allMetrics[expandedOffer.id] || [])}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrackOfertas;
