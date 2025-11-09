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
import { Plus, TrendingUp, TrendingDown, Minus, ExternalLink, Trash2, Edit, Maximize2, X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TrackedOffer {
  id: string;
  name: string;
  ad_library_link: string;
  created_at: string;
}

interface OfferMetric {
  date: string;
  active_ads_count: number;
}

const TrackOfertas = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [offers, setOffers] = useState<TrackedOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<TrackedOffer | null>(null);
  const [allMetrics, setAllMetrics] = useState<Record<string, OfferMetric[]>>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [newOffer, setNewOffer] = useState({ name: "", ad_library_link: "" });
  const [expandedOffer, setExpandedOffer] = useState<TrackedOffer | null>(null);

  const loadingMessages = [
    "🚀 Enviando informações para o Meta Ads...",
    "🕵️ Seu concorrente não vai gostar disso...",
    "📊 Analisando biblioteca de anúncios...",
    "⚡ Está quase lá...",
    "🎯 Coletando dados de performance...",
    "🔥 Descobrindo os segredos da concorrência..."
  ];

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

  const handleAddOffer = async () => {
    if (!newOffer.name || !newOffer.ad_library_link) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha o nome e o link da oferta.",
        variant: "destructive",
      });
      return;
    }

    if (offers.length >= 10) {
      toast({
        title: "Limite atingido",
        description: "Você já possui 10 ofertas cadastradas. Exclua uma oferta para adicionar outra.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    // Mostrar mensagens de loading com intervalo
    let messageIndex = 0;
    setLoadingMessage(loadingMessages[0]);
    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      setLoadingMessage(loadingMessages[messageIndex]);
    }, 2000);

    try {
      // Fazer GET para o webhook
      const response = await fetch(`https://n8n.chatwp.xyz/webhook-test/recebe-link?link=${encodeURIComponent(newOffer.ad_library_link)}`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Erro ao consultar webhook");
      }

      // Webhook retorna apenas o número como texto puro
      const webhookData = await response.text();
      console.log("🔍 Resposta do Webhook:", webhookData);
      
      const activeAdsCount = parseInt(webhookData) || 0;
      console.log("📊 Número de anúncios ativos:", activeAdsCount);

      // Inserir oferta no banco
      const { data: offerData, error: offerError } = await supabase
        .from("tracked_offers")
        .insert([{
          user_id: user?.id,
          name: newOffer.name,
          ad_library_link: newOffer.ad_library_link,
        }])
        .select()
        .single();

      if (offerError) throw offerError;

      // Inserir métrica inicial
      const today = new Date().toISOString().split("T")[0];
      const { error: metricError } = await supabase
        .from("offer_metrics")
        .insert([{
          offer_id: offerData.id,
          date: today,
          active_ads_count: activeAdsCount,
        }]);

      if (metricError) throw metricError;

      toast({
        title: "Oferta cadastrada!",
        description: `${activeAdsCount} anúncios ativos encontrados.`,
      });

      setNewOffer({ name: "", ad_library_link: "" });
      setIsDialogOpen(false);
      loadOffers();
    } catch (error: any) {
      toast({
        title: "Erro ao cadastrar oferta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      clearInterval(messageInterval);
      setIsLoading(false);
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

  return (
    <div className="min-h-screen bg-background">
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
          <div>
            <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
              Track Ofertas
            </h2>
            <p className="text-muted-foreground">
              Acompanhe a performance dos anúncios ativos das suas ofertas
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="lg" 
                className="bg-accent hover:bg-accent/90"
                disabled={offers.length >= 10}
              >
                <Plus className="mr-2 h-5 w-5" />
                Adicionar Oferta {offers.length}/10
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-2xl">Cadastrar Nova Oferta</DialogTitle>
                <DialogDescription>
                  Preencha os dados abaixo para começar a rastrear uma nova oferta.
                  O sistema buscará automaticamente a quantidade de anúncios ativos.
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
                    placeholder="https://www.facebook.com/ads/library/..."
                    value={newOffer.ad_library_link}
                    onChange={(e) => setNewOffer({ ...newOffer, ad_library_link: e.target.value })}
                    className="bg-input border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cole o link completo da biblioteca de anúncios do Facebook
                  </p>
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

          {/* Loading Dialog */}
          <Dialog open={isLoading}>
            <DialogContent className="sm:max-w-[400px] bg-card border-border text-center">
              <DialogHeader>
                <DialogTitle className="sr-only">Carregando</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-accent border-t-transparent"></div>
                <p className="text-lg font-medium text-foreground">{loadingMessage}</p>
              </div>
            </DialogContent>
          </Dialog>
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {offers.map((offer) => {
                const metrics = allMetrics[offer.id] || [];
                const variation = getVariation(metrics);
                
                return (
                  <Card key={offer.id} className="border-border bg-card/50 backdrop-blur relative group">
                      <CardHeader className="pb-2 px-3 pt-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-semibold truncate flex-1">{offer.name}</CardTitle>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        <div className="h-[120px] mb-2">
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
                                Total Hoje
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

      {/* Popup expandido */}
      <Dialog open={!!expandedOffer} onOpenChange={() => setExpandedOffer(null)}>
        <DialogContent className="sm:max-w-[90vw] md:max-w-[800px] bg-card border-2 border-accent">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">{expandedOffer?.name}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                className="text-accent hover:bg-accent/20"
                onClick={() => setExpandedOffer(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
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
                      Total de Anúncios Ativos Hoje
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
