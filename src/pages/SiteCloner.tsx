import { useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  Code,
  FileText,
  CheckCircle2
} from "lucide-react";

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

export default function SiteCloner() {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [steps, setSteps] = useState<AnalysisStep[]>([
    { id: 'fetch', name: 'Buscando página', icon: <Globe className="h-4 w-4" />, status: 'pending' },
    { id: 'structure', name: 'Analisando estrutura', icon: <Layout className="h-4 w-4" />, status: 'pending' },
    { id: 'styles', name: 'Extraindo estilos', icon: <Palette className="h-4 w-4" />, status: 'pending' },
    { id: 'media', name: 'Identificando mídia', icon: <ImageIcon className="h-4 w-4" />, status: 'pending' },
    { id: 'content', name: 'Extraindo conteúdo', icon: <Type className="h-4 w-4" />, status: 'pending' },
    { id: 'prompt', name: 'Gerando prompt', icon: <FileText className="h-4 w-4" />, status: 'pending' },
  ]);
  const { toast } = useToast();

  const updateStep = (stepId: string, status: 'pending' | 'processing' | 'completed') => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
  };

  const handleAnalyze = async () => {
    if (!url) {
      toast({ title: "Erro", description: "Digite uma URL válida", variant: "destructive" });
      return;
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

  const downloadPrompt = () => {
    if (!result) return;
    const blob = new Blob([result.generatedPrompt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'site-clone-prompt.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
              <Code className="h-8 w-8 text-primary" />
              Clonador de Entregável
            </h1>
            <p className="text-muted-foreground">
              Analise qualquer site e gere um prompt detalhado para recriá-lo com IA
            </p>
          </div>

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
                    onChange={(e) => setUrl(e.target.value)}
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
          {result && (
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
                    <p className="font-medium">{result.structure.title || 'Não encontrado'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Descrição:</span>
                    <p className="text-sm">{result.structure.description || 'Não encontrado'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Layout:</span>
                    <p className="text-sm">{result.structure.layout}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Seções ({result.structure.sections.length}):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.structure.sections.slice(0, 10).map((section, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{section}</Badge>
                      ))}
                      {result.structure.sections.length > 10 && (
                        <Badge variant="outline" className="text-xs">+{result.structure.sections.length - 10}</Badge>
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
                    <span className="text-sm text-muted-foreground">Cores ({result.styles.colors.length}):</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {result.styles.colors.slice(0, 12).map((color, i) => (
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
                      {result.styles.fonts.map((font, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{font}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Framework CSS:</span>
                    <p className="font-medium">{result.styles.cssFramework || 'Custom CSS'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Media */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-green-500" />
                    Mídia
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="text-sm text-muted-foreground">Imagens ({result.media.images.length}):</span>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {result.media.images.slice(0, 8).map((img, i) => (
                        <div key={i} className="aspect-square bg-muted rounded overflow-hidden">
                          <img 
                            src={img.src} 
                            alt={img.alt || `Imagem ${i + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Vídeos ({result.media.videos.length}):</span>
                    {result.media.videos.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.media.videos.map((video, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            <Video className="h-3 w-3 mr-1" />
                            {video.type || 'video'}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum vídeo encontrado</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Content */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Type className="h-5 w-5 text-orange-500" />
                    Conteúdo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="text-sm text-muted-foreground">Títulos ({result.content.headings.length}):</span>
                    <div className="max-h-24 overflow-y-auto mt-1">
                      {result.content.headings.slice(0, 5).map((h, i) => (
                        <p key={i} className="text-sm truncate">{h}</p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Botões ({result.content.buttons.length}):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.content.buttons.slice(0, 6).map((btn, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{btn}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Links: {result.content.links.length}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Technical */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Code className="h-5 w-5 text-red-500" />
                    Tecnologias Detectadas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {result.technical.technologies.map((tech, i) => (
                      <Badge key={i} variant="outline">{tech}</Badge>
                    ))}
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
                    value={result.generatedPrompt}
                    readOnly
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => copyToClipboard(result.generatedPrompt)} className="flex-1">
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar Prompt
                    </Button>
                    <Button variant="outline" onClick={downloadPrompt}>
                      <Download className="h-4 w-4 mr-2" />
                      Baixar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
