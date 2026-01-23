import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/useSplashedToast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { useCredits } from "@/hooks/useCredits";
import { SystemCreditBadge } from "@/components/credits/SystemCreditBadge";
import { InsufficientCreditsModal } from "@/components/credits/InsufficientCreditsModal";
import { 
  Globe, 
  Search, 
  Copy, 
  Download, 
  Loader2, 
  Image as ImageIcon,
  Video,
  Type,
  Palette,
  Layout,
  Paperclip,
  FileText,
  CheckCircle2,
  History,
  Trash2,
  Eye
} from "lucide-react";

const CREDIT_COST = 0.15;
const SYSTEM_ID = 'clonador_sites';

interface AnalysisResult {
  structure: {
    title: string;
    description: string;
    sections: string[];
    layout: string;
  };
  styles: {
    colors: string[];
    fonts: string[];
    cssFramework: string;
  };
  media: {
    images: { src: string; alt: string }[];
    videos: { src: string; type: string }[];
  };
  content: {
    headings: string[];
    paragraphs: string[];
    buttons: string[];
    links: string[];
  };
  technical: {
    technologies: string[];
    scripts: string[];
    meta: { name: string; content: string }[];
  };
  generatedPrompt: string;
}

interface AnalysisStep {
  id: string;
  name: string;
  icon: React.ReactNode;
  status: 'pending' | 'processing' | 'completed';
}

interface ClonedSite {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  created_at: string;
  generated_prompt: string;
  analysis_result: AnalysisResult;
}

export default function SiteCloner() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [clonedSites, setClonedSites] = useState<ClonedSite[]>([]);
  const [activeTab, setActiveTab] = useState("analyze");
  const [viewingHistory, setViewingHistory] = useState<ClonedSite | null>(null);
  const [steps, setSteps] = useState<AnalysisStep[]>([
    { id: 'fetch', name: 'Buscando página', icon: <Globe className="h-4 w-4" />, status: 'pending' },
    { id: 'structure', name: 'Analisando estrutura', icon: <Layout className="h-4 w-4" />, status: 'pending' },
    { id: 'styles', name: 'Extraindo estilos', icon: <Palette className="h-4 w-4" />, status: 'pending' },
    { id: 'media', name: 'Identificando mídia', icon: <ImageIcon className="h-4 w-4" />, status: 'pending' },
    { id: 'content', name: 'Extraindo conteúdo', icon: <Type className="h-4 w-4" />, status: 'pending' },
    { id: 'prompt', name: 'Gerando prompt', icon: <FileText className="h-4 w-4" />, status: 'pending' },
  ]);
  const { toast } = useToast();
  
  // Credits system
  const { isActive: isCreditsActive } = useCreditsSystem();
  const { deductCredits, canAfford } = useCredits();
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false);

  useEffect(() => {
    if (user) {
      fetchClonedSites();
    }
  }, [user]);

  const fetchClonedSites = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('cloned_sites')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setClonedSites(data.map(site => ({
        ...site,
        analysis_result: site.analysis_result as unknown as AnalysisResult
      })));
    }
  };

  const updateStep = (stepId: string, status: 'pending' | 'processing' | 'completed') => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
  };

  const handleAnalyze = async () => {
    if (!url) {
      toast({ title: "Erro", description: "Digite uma URL válida", variant: "destructive" });
      return;
    }

    // Check credits if system is active
    if (isCreditsActive) {
      if (!canAfford(CREDIT_COST)) {
        setShowInsufficientCredits(true);
        return;
      }
      
      const deducted = await deductCredits(CREDIT_COST, SYSTEM_ID, 'Clonagem de site');
      if (!deducted) {
        setShowInsufficientCredits(true);
        return;
      }
    }

    setIsAnalyzing(true);
    setProgress(0);
    setResult(null);
    setSteps(prev => prev.map(s => ({ ...s, status: 'pending' as const })));

    try {
      // Step 1: Fetch
      updateStep('fetch', 'processing');
      setProgress(10);
      
      const { data, error } = await supabase.functions.invoke('clone-site', {
        body: { url }
      });

      if (error) throw error;

      // Simulate progress through steps
      updateStep('fetch', 'completed');
      setProgress(20);
      
      updateStep('structure', 'processing');
      await new Promise(r => setTimeout(r, 300));
      updateStep('structure', 'completed');
      setProgress(40);
      
      updateStep('styles', 'processing');
      await new Promise(r => setTimeout(r, 300));
      updateStep('styles', 'completed');
      setProgress(60);
      
      updateStep('media', 'processing');
      await new Promise(r => setTimeout(r, 300));
      updateStep('media', 'completed');
      setProgress(75);
      
      updateStep('content', 'processing');
      await new Promise(r => setTimeout(r, 300));
      updateStep('content', 'completed');
      setProgress(90);
      
      updateStep('prompt', 'processing');
      await new Promise(r => setTimeout(r, 300));
      updateStep('prompt', 'completed');
      setProgress(100);

      setResult(data);

      // Save to history
      if (user) {
        await supabase.from('cloned_sites').insert({
          user_id: user.id,
          url,
          title: data.structure.title,
          description: data.structure.description,
          analysis_result: data,
          generated_prompt: data.generatedPrompt
        });
        fetchClonedSites();
      }

      toast({ title: "Sucesso", description: "Site analisado com sucesso!" });
    } catch (error: any) {
      console.error('Error analyzing site:', error);
      toast({ 
        title: "Erro", 
        description: error.message || "Erro ao analisar o site", 
        variant: "destructive" 
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Prompt copiado para a área de transferência" });
  };

  const downloadPrompt = (prompt: string) => {
    const blob = new Blob([prompt], { type: 'text/plain' });
    const urlObj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlObj;
    a.download = 'site-clone-prompt.txt';
    a.click();
    URL.revokeObjectURL(urlObj);
  };

  const deleteClonedSite = async (id: string) => {
    const { error } = await supabase
      .from('cloned_sites')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Erro", description: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Excluído", description: "Site removido do histórico" });
      fetchClonedSites();
    }
  };

  const viewHistorySite = (site: ClonedSite) => {
    setViewingHistory(site);
    setResult(site.analysis_result);
    setActiveTab("analyze");
  };

  const currentResult = viewingHistory ? viewingHistory.analysis_result : result;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="h-14 md:h-16" />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
              <Paperclip className="h-8 w-8 text-primary" />
              Clonador de Entregável
            </h1>
            <p className="text-muted-foreground">
              Analise qualquer site e gere um prompt detalhado para recriá-lo com IA
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
              <TabsTrigger value="analyze">
                <Search className="h-4 w-4 mr-2" />
                Analisar
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                Histórico ({clonedSites.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analyze" className="space-y-6">
              {/* URL Input */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">URL do Site</CardTitle>
                  <CardDescription>
                    Cole a URL do site que deseja clonar
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="https://exemplo.com"
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          setViewingHistory(null);
                        }}
                        className="pl-10"
                        disabled={isAnalyzing}
                      />
                    </div>
                    <Button onClick={handleAnalyze} disabled={isAnalyzing || !url}>
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      Analisar
                    </Button>
                  </div>

                  {/* Progress */}
                  {isAnalyzing && (
                    <div className="space-y-4">
                      <Progress value={progress} className="h-2" />
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {steps.map((step) => (
                          <div 
                            key={step.id}
                            className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                              step.status === 'completed' 
                                ? 'bg-green-500/10 text-green-500' 
                                : step.status === 'processing'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {step.status === 'completed' ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : step.status === 'processing' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              step.icon
                            )}
                            <span className="text-sm">{step.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Results */}
              {currentResult && (
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Structure */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Layout className="h-5 w-5 text-blue-500" />
                        Estrutura
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <span className="text-sm text-muted-foreground">Título:</span>
                        <p className="font-medium">{currentResult.structure.title || 'Não encontrado'}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Descrição:</span>
                        <p className="text-sm">{currentResult.structure.description || 'Não encontrado'}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Layout:</span>
                        <p className="text-sm">{currentResult.structure.layout}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Seções ({currentResult.structure.sections.length}):</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {currentResult.structure.sections.slice(0, 10).map((section, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{section}</Badge>
                          ))}
                          {currentResult.structure.sections.length > 10 && (
                            <Badge variant="outline" className="text-xs">+{currentResult.structure.sections.length - 10}</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Styles */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Palette className="h-5 w-5 text-purple-500" />
                        Estilos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <span className="text-sm text-muted-foreground">Cores ({currentResult.styles.colors.length}):</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {currentResult.styles.colors.slice(0, 12).map((color, i) => (
                            <div 
                              key={i} 
                              className="flex items-center gap-1"
                              title={color}
                            >
                              <div 
                                className="w-6 h-6 rounded border border-border" 
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-xs font-mono">{color}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Fontes:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {currentResult.styles.fonts.length > 0 ? (
                            currentResult.styles.fonts.map((font, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{font}</Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">Não detectadas</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Framework CSS:</span>
                        <p className="font-medium">{currentResult.styles.cssFramework || 'Custom CSS'}</p>
                      </div>
                    </CardContent>
                  </Card>


                  {/* Generated Prompt */}
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Prompt Gerado
                      </CardTitle>
                      <CardDescription>
                        Use este prompt para recriar o site com IA
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea
                        value={currentResult.generatedPrompt}
                        readOnly
                        className="min-h-[300px] font-mono text-sm"
                      />
                      <div className="flex gap-2">
                        <Button onClick={() => copyToClipboard(currentResult.generatedPrompt)} className="flex-1">
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar Prompt
                        </Button>
                        <Button variant="outline" onClick={() => downloadPrompt(currentResult.generatedPrompt)}>
                          <Download className="h-4 w-4 mr-2" />
                          Baixar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history">
              {clonedSites.length === 0 ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhum site clonado</h3>
                    <p className="text-muted-foreground">Analise um site para salvar no histórico</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {clonedSites.map((site) => (
                    <Card key={site.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base truncate">{site.title || 'Sem título'}</CardTitle>
                        <CardDescription className="truncate">{site.url}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground mb-4">
                          {new Date(site.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => viewHistorySite(site)}>
                            <Eye className="h-3 w-3 mr-1" />
                            Ver
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => copyToClipboard(site.generated_prompt)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteClonedSite(site.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      
      <InsufficientCreditsModal
        open={showInsufficientCredits}
        onOpenChange={setShowInsufficientCredits}
        requiredCredits={CREDIT_COST}
        systemName="Clonador de Sites"
      />
    </div>
  );
}
