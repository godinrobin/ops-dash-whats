import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { ArrowLeft, Search, Copy, Eye, Star, Sparkles, Loader2, RefreshCw, Play, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface VideoPrompt {
  id: string;
  title: string;
  prompt_text: string;
  category: string;
  preview_url: string | null;
  preview_thumbnail: string | null;
  source: string;
  tags: string[];
  ai_model: string;
  is_featured: boolean;
  uses_count: number;
  created_at: string;
}

const CATEGORIES = [
  { value: "all", label: "Todas as Categorias" },
  { value: "cinematic", label: "Cinematográfico" },
  { value: "nature", label: "Natureza" },
  { value: "anime", label: "Anime" },
  { value: "commercial", label: "Comercial" },
  { value: "abstract", label: "Abstrato" },
  { value: "fantasy", label: "Fantasia" },
  { value: "sci-fi", label: "Ficção Científica" },
  { value: "horror", label: "Terror" },
  { value: "food", label: "Comida" },
  { value: "dance", label: "Dança" },
  { value: "sports", label: "Esportes" },
  { value: "timelapse", label: "Timelapse" },
  { value: "retro", label: "Retrô" },
  { value: "architecture", label: "Arquitetura" },
  { value: "weather", label: "Clima" },
];

const AI_MODELS = [
  { value: "all", label: "Todos os Modelos" },
  { value: "sora", label: "Sora (OpenAI)" },
  { value: "veo", label: "Veo (Google)" },
  { value: "runway", label: "Runway" },
  { value: "kling", label: "Kling" },
];

const VideoPromptsLibrary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAdminStatus();
  
  const [prompts, setPrompts] = useState<VideoPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedModel, setSelectedModel] = useState("all");
  const [selectedPrompt, setSelectedPrompt] = useState<VideoPrompt | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState({
    title: "",
    prompt_text: "",
    category: "cinematic",
    preview_thumbnail: "",
    tags: "",
    ai_model: "sora"
  });
  const [addingPrompt, setAddingPrompt] = useState(false);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('video_prompts')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('uses_count', { ascending: false });

      if (error) throw error;
      setPrompts(data || []);
    } catch (error: any) {
      console.error('Error fetching prompts:', error);
      toast({
        title: "Erro ao carregar prompts",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImportPrompts = async () => {
    try {
      setImporting(true);
      const { data, error } = await supabase.functions.invoke('import-video-prompts');

      if (error) throw error;

      toast({
        title: "Importação concluída",
        description: `${data.imported} novos prompts importados. Total: ${data.total}`,
      });

      fetchPrompts();
    } catch (error: any) {
      console.error('Error importing prompts:', error);
      toast({
        title: "Erro na importação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const copyPrompt = async (prompt: VideoPrompt) => {
    try {
      await navigator.clipboard.writeText(prompt.prompt_text);
      
      // Increment uses count
      await supabase
        .from('video_prompts')
        .update({ uses_count: prompt.uses_count + 1 })
        .eq('id', prompt.id);

      toast({
        title: "Prompt copiado!",
        description: "Cole no seu gerador de vídeos favorito",
      });

      // Update local state
      setPrompts(prompts.map(p => 
        p.id === prompt.id ? { ...p, uses_count: p.uses_count + 1 } : p
      ));
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o prompt",
        variant: "destructive",
      });
    }
  };

  const handleAddPrompt = async () => {
    if (!newPrompt.title || !newPrompt.prompt_text) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha título e prompt",
        variant: "destructive",
      });
      return;
    }

    try {
      setAddingPrompt(true);
      const { error } = await supabase
        .from('video_prompts')
        .insert({
          title: newPrompt.title,
          prompt_text: newPrompt.prompt_text,
          category: newPrompt.category,
          preview_thumbnail: newPrompt.preview_thumbnail || null,
          tags: newPrompt.tags.split(',').map(t => t.trim()).filter(Boolean),
          ai_model: newPrompt.ai_model,
          source: 'admin'
        });

      if (error) throw error;

      toast({
        title: "Prompt adicionado!",
        description: "O prompt foi salvo com sucesso",
      });

      setShowAddModal(false);
      setNewPrompt({
        title: "",
        prompt_text: "",
        category: "cinematic",
        preview_thumbnail: "",
        tags: "",
        ai_model: "sora"
      });
      fetchPrompts();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAddingPrompt(false);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    try {
      const { error } = await supabase
        .from('video_prompts')
        .delete()
        .eq('id', promptId);

      if (error) throw error;

      toast({
        title: "Prompt removido!",
      });

      fetchPrompts();
    } catch (error: any) {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleFeatured = async (prompt: VideoPrompt) => {
    try {
      const { error } = await supabase
        .from('video_prompts')
        .update({ is_featured: !prompt.is_featured })
        .eq('id', prompt.id);

      if (error) throw error;

      toast({
        title: prompt.is_featured ? "Removido dos destaques" : "Adicionado aos destaques",
      });

      fetchPrompts();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredPrompts = prompts.filter(prompt => {
    const matchesSearch = 
      prompt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prompt.prompt_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prompt.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === "all" || prompt.category === selectedCategory;
    const matchesModel = selectedModel === "all" || prompt.ai_model === selectedModel;

    return matchesSearch && matchesCategory && matchesModel;
  });

  const featuredPrompts = filteredPrompts.filter(p => p.is_featured);
  const regularPrompts = filteredPrompts.filter(p => !p.is_featured);

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find(c => c.value === value)?.label || value;
  };

  return (
    <>
      <Header mode="sistemas" onModeChange={() => {}} />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="container mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent flex items-center gap-2">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  Biblioteca de Prompts
                </h1>
                <p className="text-muted-foreground mt-1">
                  Prompts prontos para gerar vídeos incríveis com IA
                </p>
              </div>
            </div>

            {isAdmin && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleImportPrompts}
                  disabled={importing}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Importar Prompts
                </Button>
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, descrição ou tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Modelo IA" />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(model => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mb-6 text-sm text-muted-foreground">
            <span>{filteredPrompts.length} prompts encontrados</span>
            {featuredPrompts.length > 0 && (
              <span>• {featuredPrompts.length} em destaque</span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : prompts.length === 0 ? (
            <Card className="py-20 text-center">
              <CardContent>
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Nenhum prompt ainda</h3>
                <p className="text-muted-foreground mb-4">
                  {isAdmin ? "Clique em 'Importar Prompts' para começar" : "Os prompts serão adicionados em breve"}
                </p>
                {isAdmin && (
                  <Button onClick={handleImportPrompts} disabled={importing}>
                    {importing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Importar Prompts
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Featured Section */}
              {featuredPrompts.length > 0 && (
                <div className="mb-10">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                    Destaques
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featuredPrompts.map(prompt => (
                      <PromptCard 
                        key={prompt.id} 
                        prompt={prompt} 
                        onView={() => setSelectedPrompt(prompt)}
                        onCopy={() => copyPrompt(prompt)}
                        onToggleFeatured={isAdmin ? () => toggleFeatured(prompt) : undefined}
                        onDelete={isAdmin ? () => handleDeletePrompt(prompt.id) : undefined}
                        getCategoryLabel={getCategoryLabel}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All Prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {regularPrompts.map(prompt => (
                  <PromptCard 
                    key={prompt.id} 
                    prompt={prompt} 
                    onView={() => setSelectedPrompt(prompt)}
                    onCopy={() => copyPrompt(prompt)}
                    onToggleFeatured={isAdmin ? () => toggleFeatured(prompt) : undefined}
                    onDelete={isAdmin ? () => handleDeletePrompt(prompt.id) : undefined}
                    getCategoryLabel={getCategoryLabel}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>

              {filteredPrompts.length === 0 && (
                <div className="text-center py-12">
                  <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhum prompt encontrado com esses filtros</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Prompt Detail Modal */}
      <Dialog open={!!selectedPrompt} onOpenChange={() => setSelectedPrompt(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPrompt && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedPrompt.title}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{getCategoryLabel(selectedPrompt.category)}</Badge>
                  <Badge variant="outline">{selectedPrompt.ai_model.toUpperCase()}</Badge>
                  <span className="text-xs">• {selectedPrompt.uses_count} usos</span>
                </DialogDescription>
              </DialogHeader>
              
              {selectedPrompt.preview_thumbnail && (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                  <img 
                    src={selectedPrompt.preview_thumbnail} 
                    alt={selectedPrompt.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Prompt Completo</h4>
                  <div className="p-4 bg-muted rounded-lg text-sm">
                    {selectedPrompt.prompt_text}
                  </div>
                </div>

                {selectedPrompt.tags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPrompt.tags.map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  onClick={() => {
                    copyPrompt(selectedPrompt);
                    setSelectedPrompt(null);
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Prompt
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Prompt Modal (Admin) */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Prompt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Título *</label>
              <Input
                value={newPrompt.title}
                onChange={(e) => setNewPrompt({ ...newPrompt, title: e.target.value })}
                placeholder="Ex: Astronauta no Espaço"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Prompt *</label>
              <Textarea
                value={newPrompt.prompt_text}
                onChange={(e) => setNewPrompt({ ...newPrompt, prompt_text: e.target.value })}
                placeholder="Descreva a cena em detalhes..."
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Categoria</label>
                <Select 
                  value={newPrompt.category} 
                  onValueChange={(v) => setNewPrompt({ ...newPrompt, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter(c => c.value !== "all").map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Modelo IA</label>
                <Select 
                  value={newPrompt.ai_model} 
                  onValueChange={(v) => setNewPrompt({ ...newPrompt, ai_model: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.filter(m => m.value !== "all").map(model => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">URL da Thumbnail (opcional)</label>
              <Input
                value={newPrompt.preview_thumbnail}
                onChange={(e) => setNewPrompt({ ...newPrompt, preview_thumbnail: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tags (separadas por vírgula)</label>
              <Input
                value={newPrompt.tags}
                onChange={(e) => setNewPrompt({ ...newPrompt, tags: e.target.value })}
                placeholder="space, cinematic, sci-fi"
              />
            </div>
            <Button 
              className="w-full" 
              onClick={handleAddPrompt}
              disabled={addingPrompt}
            >
              {addingPrompt ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Adicionar Prompt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Prompt Card Component
interface PromptCardProps {
  prompt: VideoPrompt;
  onView: () => void;
  onCopy: () => void;
  onToggleFeatured?: () => void;
  onDelete?: () => void;
  getCategoryLabel: (value: string) => string;
  isAdmin: boolean;
}

const PromptCard = ({ 
  prompt, 
  onView, 
  onCopy, 
  onToggleFeatured, 
  onDelete,
  getCategoryLabel,
  isAdmin 
}: PromptCardProps) => {
  return (
    <Card className="group hover:shadow-lg transition-all hover:scale-[1.02] overflow-hidden">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {prompt.preview_thumbnail ? (
          <img 
            src={prompt.preview_thumbnail} 
            alt={prompt.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" onClick={onView}>
            <Eye className="h-4 w-4 mr-1" />
            Ver
          </Button>
          <Button size="sm" onClick={onCopy}>
            <Copy className="h-4 w-4 mr-1" />
            Copiar
          </Button>
        </div>

        {/* Featured badge */}
        {prompt.is_featured && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-yellow-500 text-black">
              <Star className="h-3 w-3 mr-1 fill-current" />
              Destaque
            </Badge>
          </div>
        )}

        {/* Admin controls */}
        {isAdmin && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onToggleFeatured && (
              <Button 
                size="icon" 
                variant="secondary" 
                className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); onToggleFeatured(); }}
              >
                <Star className={`h-3 w-3 ${prompt.is_featured ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </Button>
            )}
            {onDelete && (
              <Button 
                size="icon" 
                variant="destructive" 
                className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      <CardHeader className="p-3">
        <CardTitle className="text-sm line-clamp-1">{prompt.title}</CardTitle>
        <CardDescription className="text-xs line-clamp-2">
          {prompt.prompt_text.slice(0, 80)}...
        </CardDescription>
      </CardHeader>

      <CardContent className="p-3 pt-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {getCategoryLabel(prompt.category)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {prompt.ai_model}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">{prompt.uses_count} usos</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default VideoPromptsLibrary;
