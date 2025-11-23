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
import { Plus, TrendingUp, TrendingDown, Minus, ExternalLink, Trash2, Edit, Maximize2, X, RefreshCw, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
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
  is_invalid_link: boolean;
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
  const [isDailyUpdateRunning, setIsDailyUpdateRunning] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [newOffer, setNewOffer] = useState({ name: "", ad_library_link: "" });
  const [expandedOffer, setExpandedOffer] = useState<TrackedOffer | null>(null);
  const [updateProgress, setUpdateProgress] = useState({ processed: 0, total: 0, failed: 0 });

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
      checkDailyUpdateStatus();
      
      // Subscribe to update status changes
      const channel = supabase
        .channel('daily-update-status')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'daily_update_status',
          },
          (payload) => {
            console.log('Update status changed:', payload);
            if (payload.new && typeof payload.new === 'object' && 'is_running' in payload.new) {
              setIsDailyUpdateRunning(payload.new.is_running as boolean);
              
              // Update progress data
              const processed = (payload.new as any).processed_offers || 0;
              const total = (payload.new as any).total_offers || 0;
              const failed = (payload.new as any).failed_offers || 0;
              setUpdateProgress({ processed, total, failed });
              
              if (!payload.new.is_running) {
                // Update completed, refresh all data
                loadOffers();
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
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

  const checkDailyUpdateStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('daily_update_status')
        .select('is_running, processed_offers, total_offers, failed_offers')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setIsDailyUpdateRunning(data.is_running);
        setUpdateProgress({
          processed: data.processed_offers || 0,
          total: data.total_offers || 0,
          failed: data.failed_offers || 0,
        });
      }
    } catch (error) {
      console.error('Error checking update status:', error);
    }
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

    // Check if it's a specific page/ad link, not a keyword search
    const hasSpecificId = link.includes('id=') && !link.includes('search_type=keyword');
    const hasPageId = link.includes('view_all_page_id=');
    
    if (!hasSpecificId && !hasPageId) {
      toast({
        title: "Link inválido",
        description: "Use o link de uma página ou anúncio específico, não uma busca por palavras-chave.",
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

    try {
      // Inserir oferta no banco (sem buscar métricas)
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
        description: "Os dados dos anúncios serão atualizados até às 08:00.",
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

  const handleManualUpdate = async () => {
    if (offers.length === 0) {
      toast({
        title: "Nenhuma oferta cadastrada",
        description: "Cadastre ofertas antes de atualizar.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDailyUpdateRunning(true);
      let completed = false;
      let attempts = 0;
      const maxAttempts = 50;
      const startTime = Date.now();
      const maxDuration = 10 * 60 * 1000; // 10 minutos máximo
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3;
      
      console.log('🚀 Iniciando atualização manual de ofertas...');
      
      while (!completed && attempts < maxAttempts) {
        attempts++;
        
        // Verificar timeout de segurança
        if (Date.now() - startTime > maxDuration) {
          console.error('❌ Atualização cancelada: tempo máximo excedido (10 min)');
          throw new Error('Tempo máximo de atualização excedido');
        }
        
        console.log(`📡 [${attempts}/${maxAttempts}] Chamando edge function...`);
        
        try {
          const response = await fetch(
            `https://dcjizoulbggsavizbukq.supabase.co/functions/v1/update-offers-daily`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ manual_trigger: true })
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ HTTP ${response.status}:`, errorText);
            consecutiveErrors++;
            
            if (consecutiveErrors >= maxConsecutiveErrors) {
              throw new Error(`Muitos erros consecutivos (${consecutiveErrors}). Último: HTTP ${response.status}`);
            }
            
            console.warn(`⚠️ Tentando novamente após erro... (${consecutiveErrors}/${maxConsecutiveErrors})`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }

          const data = await response.json();
          console.log(`✅ Lote ${attempts} processado:`, JSON.stringify(data));
          
          // Reset error counter on success
          consecutiveErrors = 0;

          // Verificar se completou
          if (data?.completed === true) {
            console.log('🎉 Atualização completa! Total processado:', data.processed);
            completed = true;
            break;
          } 
          
          // Verificar se há mais para processar
          if (data?.remaining !== undefined && data.remaining > 0) {
            console.log(`⏳ Aguardando 3s... (Restantes: ${data.remaining}/${data.total})`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }
          
          // Se chegou aqui, resposta inesperada
          console.warn('⚠️ Resposta sem "completed" ou "remaining". Assumindo conclusão:', data);
          completed = true;
          
        } catch (fetchError: any) {
          console.error(`❌ Erro na tentativa ${attempts}:`, fetchError);
          consecutiveErrors++;
          
          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw new Error(`Muitos erros consecutivos (${consecutiveErrors}). Último: ${fetchError.message}`);
          }
          
          console.warn(`⚠️ Tentando novamente após erro... (${consecutiveErrors}/${maxConsecutiveErrors})`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (attempts >= maxAttempts) {
        console.warn('⚠️ Limite de tentativas atingido');
        throw new Error(`Limite de ${maxAttempts} tentativas atingido`);
      }

      console.log('🔄 Recarregando dados...');
      setTimeout(() => {
        loadOffers();
        setIsDailyUpdateRunning(false);
      }, 2000);
      
      toast({
        title: "Atualização concluída",
        description: "As ofertas foram atualizadas com sucesso.",
      });
      
    } catch (error: any) {
      console.error('💥 Erro fatal na atualização:', error);
      setIsDailyUpdateRunning(false);
      toast({
        title: "Erro ao atualizar",
        description: error.message || "Ocorreu um erro ao processar a atualização.",
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

  const isInvalidLink = (metrics: OfferMetric[]) => {
    if (metrics.length === 0) return false;
    // Verifica se a última métrica foi marcada como link inválido
    return metrics[metrics.length - 1].is_invalid_link === true;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Blur overlay when daily update is running */}
      {isDailyUpdateRunning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card p-8 rounded-lg border-2 border-accent max-w-md mx-4">
            <div className="flex flex-col items-center gap-6">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-accent border-t-transparent"></div>
              <div className="text-center w-full">
                <h3 className="text-2xl font-semibold mb-2">Atualizando ofertas...</h3>
                <p className="text-muted-foreground mb-4">
                  Estamos atualizando os dados de todas as ofertas. Isso pode levar alguns minutos.
                </p>
                {updateProgress.total > 0 && (
                  <div className="space-y-3 mt-6">
                    <Progress 
                      value={(updateProgress.processed / updateProgress.total) * 100} 
                      className="h-3"
                    />
                    <div className="flex justify-center text-sm">
                      <span className="text-accent font-semibold text-lg">
                        {Math.round((updateProgress.processed / updateProgress.total) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-orange-400/30 bg-orange-400/5">
              <span className="text-sm text-muted-foreground">
                ℹ️ Os resultados dos anúncios são atualizados diariamente às 08:00
              </span>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={handleManualUpdate}
              disabled={isDailyUpdateRunning || offers.length === 0}
              variant="outline"
              size="lg"
              className="border-accent text-accent hover:bg-accent/10"
            >
              <RefreshCw className={`mr-2 h-5 w-5 ${isDailyUpdateRunning ? 'animate-spin' : ''}`} />
              Atualizar Agora
            </Button>
            
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
                const hasInvalidLink = isInvalidLink(metrics);
                
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
                        {hasInvalidLink && (
                          <Alert variant="destructive" className="mb-3 p-2 border-destructive/50">
                            <AlertTriangle className="h-3 w-3" />
                            <AlertDescription className="text-[10px] leading-tight ml-5">
                              Link inválido detectado. O link não aponta para uma página ou anúncio específico. Verifique e atualize.
                            </AlertDescription>
                          </Alert>
                        )}
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
          
          {expandedOffer && isInvalidLink(allMetrics[expandedOffer.id] || []) && (
            <Alert variant="destructive" className="border-destructive/50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-6">
                <strong>Link inválido detectado.</strong> O link desta oferta não aponta para uma página ou anúncio específico da Biblioteca de Anúncios do Facebook. Por favor, verifique se o link está correto e atualize a oferta.
              </AlertDescription>
            </Alert>
          )}
          
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
