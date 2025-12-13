import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Wand2, MessageSquare, Mic, Image, Video, FileText, ChevronDown, ChevronUp, Lightbulb, Edit, Plus, Save, Trash2, FolderOpen, Sparkles, Loader2, Send } from "lucide-react";
import { TicketTagInput } from "@/components/TicketTagInput";
import { useActivityTracker } from "@/hooks/useActivityTracker";

interface FunnelMessage {
  type: "text" | "audio" | "image" | "video" | "ebook";
  content: string;
  instruction?: string;
}

interface FunnelSection {
  title: string;
  concept: string;
  messages: FunnelMessage[];
}

interface GeneratedFunnel {
  sections: FunnelSection[];
}

interface SavedFunnel {
  id: string;
  name: string;
  config: any;
  funnel_content: GeneratedFunnel | null;
  created_at: string;
  updated_at: string;
}

const nicheOptions = [
  "Artesanato",
  "Receitas",
  "Religião",
  "Moda e Beleza",
  "Finanças",
  "Outro",
];

const productExamples: Record<string, string[]> = {
  "Artesanato": ["Amigurumi", "Crochê", "Kokedama", "Bordado", "Macramê"],
  "Receitas": ["Bolos Caseiros", "Marmitas Fit", "Doces Gourmet", "Receitas Low Carb", "Confeitaria"],
  "Religião": ["Resumo Bíblico", "Devocional Diário", "Estudos Bíblicos", "Orações Guiadas", "Teologia Básica"],
  "Moda e Beleza": ["Design de Sobrancelhas", "Unhas Decoradas", "Maquiagem", "Corte e Costura", "Alongamento de Cílios"],
  "Finanças": ["Planilha de Gastos", "Investimentos para Iniciantes", "Renda Extra", "Organização Financeira", "Controle de Dívidas"],
  "Outro": [],
};

const angleOptions = [
  "Renda Extra",
  "Aprendizado",
  "Desenvolvimento Pessoal",
  "Transformação de Vida",
  "Hobby Lucrativo",
  "Liberdade Financeira",
  "Crescimento Profissional",
  "Outro",
];

const pixKeyTypeOptions = [
  "CPF",
  "Telefone",
  "Email",
  "Aleatória",
];

const toneOptions = [
  { value: "informal", label: "Informal" },
  { value: "formal", label: "Formal" },
  { value: "descontraido", label: "Descontraído" },
  { value: "leve", label: "Leve" },
];

const WhatsAppFunnelCreator = () => {
  useActivityTracker("page_visit", "Criador de Funil");
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [generatedFunnel, setGeneratedFunnel] = useState<GeneratedFunnel | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [showSiteRecommendation, setShowSiteRecommendation] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [savedFunnels, setSavedFunnels] = useState<SavedFunnel[]>([]);
  const [currentFunnelId, setCurrentFunnelId] = useState<string | null>(null);
  const [showSavedFunnels, setShowSavedFunnels] = useState(true);
  const [isLoadingFunnels, setIsLoadingFunnels] = useState(true);
  const [ticketsList, setTicketsList] = useState<string[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFunnelName, setSaveFunnelName] = useState("");
  const [editingFunnelId, setEditingFunnelId] = useState<string | null>(null);
  const [editingFunnelName, setEditingFunnelName] = useState("");
  
  // AI Edit State
  const [showAIEditDialog, setShowAIEditDialog] = useState(false);
  const [aiEditRequest, setAiEditRequest] = useState("");
  const [isEditingWithAI, setIsEditingWithAI] = useState(false);
  
  const [formData, setFormData] = useState({
    niche: "",
    customNiche: "",
    product: "",
    customProduct: "",
    expertName: "",
    angle: "",
    customAngle: "",
    tickets: "",
    tone: "informal",
    pixKey: "",
    pixName: "",
    pixBank: "",
    pixKeyType: "",
    siteUrl: "",
    bonus: "",
    ebookContent: "",
  });

  useEffect(() => {
    if (user) {
      loadSavedFunnels();
    }
  }, [user]);

  const loadSavedFunnels = async () => {
    if (!user) return;
    setIsLoadingFunnels(true);
    
    const { data, error } = await supabase
      .from("saved_funnels")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error loading funnels:", error);
    } else {
      setSavedFunnels((data as unknown as SavedFunnel[]) || []);
    }
    setIsLoadingFunnels(false);
  };

  const handleGenerateFunnel = async () => {
    if (!formData.niche || !formData.product || !formData.expertName || !formData.angle || ticketsList.length === 0) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    // Show site recommendation popup if no site URL
    if (!formData.siteUrl) {
      setShowSiteRecommendation(true);
      return;
    }

    await generateFunnel();
  };

  const generateFunnel = async () => {
    setIsLoading(true);
    setShowSiteRecommendation(false);

    try {
      const { data, error } = await supabase.functions.invoke("generate-whatsapp-funnel", {
        body: {
          niche: formData.niche === "Outro" ? formData.customNiche : formData.niche,
          product: formData.product === "Outro" ? formData.customProduct : formData.product,
          expertName: formData.expertName,
          angle: formData.angle === "Outro" ? formData.customAngle : formData.angle,
          tickets: ticketsList.join(", "),
          tone: formData.tone,
          pixKey: formData.pixKey,
          pixName: formData.pixName,
          pixBank: formData.pixBank,
          pixKeyType: formData.pixKeyType,
          siteUrl: formData.siteUrl,
          bonus: formData.bonus,
          ebookContent: formData.ebookContent,
        },
      });

      if (error) throw error;

      setGeneratedFunnel(data.funnel);
      setExpandedSections(data.funnel.sections.reduce((acc: Record<string, boolean>, section: FunnelSection) => {
        acc[section.title] = true;
        return acc;
      }, {}));
      setShowConfig(false);
      setShowSavedFunnels(false);

      toast({
        title: "Funil gerado com sucesso!",
        description: "Seu funil de WhatsApp está pronto para uso.",
      });
    } catch (error: any) {
      console.error("Error generating funnel:", error);
      toast({
        title: "Erro ao gerar funil",
        description: error.message || "Ocorreu um erro ao processar sua solicitação.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveFunnel = async (name?: string) => {
    if (!user || !generatedFunnel) return;

    const funnelName = name || saveFunnelName || (formData.product === "Outro" ? formData.customProduct : formData.product) || "Novo Funil";
    const configToSave = { ...formData, tickets: ticketsList.join(", ") };
    
    try {
      if (currentFunnelId) {
        // Update existing funnel
        const { error } = await supabase
          .from("saved_funnels")
          .update({
            config: JSON.parse(JSON.stringify(configToSave)),
            funnel_content: JSON.parse(JSON.stringify(generatedFunnel)),
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentFunnelId);

        if (error) throw error;

        toast({
          title: "Funil salvo!",
          description: "Suas alterações foram salvas com sucesso.",
        });
      } else {
        // Create new funnel
        const { data, error } = await supabase
          .from("saved_funnels")
          .insert([{
            user_id: user.id,
            name: funnelName,
            config: JSON.parse(JSON.stringify(configToSave)),
            funnel_content: JSON.parse(JSON.stringify(generatedFunnel)),
          }])
          .select()
          .single();

        if (error) throw error;

        setCurrentFunnelId(data.id);
        toast({
          title: "Funil salvo!",
          description: "Seu funil foi salvo com sucesso.",
        });
      }

      setShowSaveDialog(false);
      setSaveFunnelName("");
      loadSavedFunnels();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar funil",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateFunnelName = async () => {
    if (!editingFunnelId || !editingFunnelName.trim()) return;

    try {
      const { error } = await supabase
        .from("saved_funnels")
        .update({ name: editingFunnelName.trim() })
        .eq("id", editingFunnelId);

      if (error) throw error;

      toast({
        title: "Nome atualizado!",
        description: "O nome do funil foi alterado com sucesso.",
      });

      setEditingFunnelId(null);
      setEditingFunnelName("");
      loadSavedFunnels();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar nome",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLoadFunnel = (funnel: SavedFunnel) => {
    setFormData(funnel.config);
    // Load tickets from config
    if (funnel.config.tickets) {
      setTicketsList(funnel.config.tickets.split(", ").filter((t: string) => t.trim()));
    } else {
      setTicketsList([]);
    }
    setGeneratedFunnel(funnel.funnel_content);
    setCurrentFunnelId(funnel.id);
    setShowConfig(false);
    setShowSavedFunnels(false);
    if (funnel.funnel_content) {
      setExpandedSections(funnel.funnel_content.sections.reduce((acc: Record<string, boolean>, section: FunnelSection) => {
        acc[section.title] = true;
        return acc;
      }, {}));
    }
  };

  const handleDeleteFunnel = async (funnelId: string) => {
    if (!confirm("Deseja realmente excluir este funil?")) return;

    try {
      const { error } = await supabase
        .from("saved_funnels")
        .delete()
        .eq("id", funnelId);

      if (error) throw error;

      toast({
        title: "Funil excluído",
        description: "O funil foi removido com sucesso.",
      });

      loadSavedFunnels();

      if (currentFunnelId === funnelId) {
        handleNewFunnel();
      }
    } catch (error: any) {
      toast({
        title: "Erro ao excluir funil",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleNewFunnel = () => {
    setFormData({
      niche: "",
      customNiche: "",
      product: "",
      customProduct: "",
      expertName: "",
      angle: "",
      customAngle: "",
      tickets: "",
      tone: "informal",
      pixKey: "",
      pixName: "",
      pixBank: "",
      pixKeyType: "",
      siteUrl: "",
      bonus: "",
      ebookContent: "",
    });
    setTicketsList([]);
    setGeneratedFunnel(null);
    setCurrentFunnelId(null);
    setShowConfig(true);
    setShowSavedFunnels(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "Texto copiado para a área de transferência.",
    });
  };

  const handleAIEdit = async () => {
    if (!aiEditRequest.trim() || !generatedFunnel) return;

    setIsEditingWithAI(true);
    try {
      const productContext = formData.product === "Outro" 
        ? formData.customProduct 
        : formData.product;

      const { data, error } = await supabase.functions.invoke("edit-funnel-with-ai", {
        body: {
          funnelContent: generatedFunnel,
          editRequest: aiEditRequest.trim(),
          productContext,
        },
      });

      if (error) throw error;

      if (data.funnel) {
        setGeneratedFunnel(data.funnel);
        setExpandedSections(data.funnel.sections.reduce((acc: Record<string, boolean>, section: FunnelSection) => {
          acc[section.title] = true;
          return acc;
        }, {}));

        toast({
          title: "Funil editado com sucesso!",
          description: "As alterações foram aplicadas.",
        });
        
        setAiEditRequest("");
        setShowAIEditDialog(false);
      }
    } catch (error: any) {
      console.error("Error editing funnel:", error);
      toast({
        title: "Erro ao editar funil",
        description: error.message || "Ocorreu um erro ao processar sua solicitação.",
        variant: "destructive",
      });
    } finally {
      setIsEditingWithAI(false);
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case "text":
        return <MessageSquare className="h-4 w-4" />;
      case "audio":
        return <Mic className="h-4 w-4" />;
      case "image":
        return <Image className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "ebook":
        return <FileText className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case "text":
        return "Texto";
      case "audio":
        return "Áudio";
      case "image":
        return "Imagem";
      case "video":
        return "Vídeo";
      case "ebook":
        return "E-book/PDF";
      default:
        return "Mensagem";
    }
  };

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Site Recommendation Popup */}
      <Dialog open={showSiteRecommendation} onOpenChange={setShowSiteRecommendation}>
        <DialogContent className="sm:max-w-[500px] bg-card border-accent">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Lightbulb className="h-5 w-5 text-accent" />
              Recomendação Importante
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Para aumentar sua conversão, é altamente recomendado criar um <strong>site do produto em formato de app</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Isso é ensinado no treinamento <strong className="text-accent">Starter Whats</strong>. Um site bem estruturado pode aumentar significativamente suas vendas!
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={generateFunnel}
                className="flex-1"
              >
                Continuar sem site
              </Button>
              <Button
                onClick={() => setShowSiteRecommendation(false)}
                className="flex-1 bg-accent hover:bg-accent/90"
              >
                Adicionar site
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Edit Dialog */}
      <Dialog open={showAIEditDialog} onOpenChange={setShowAIEditDialog}>
        <DialogContent className="sm:max-w-[500px] bg-card border-purple-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Editar Funil com IA
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Descreva qual alteração você deseja fazer no funil e a IA irá aplicar automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Textarea
              placeholder="Ex: Troque o nome da expert para Maria, adicione mais urgência nas mensagens de cobrança, mude o tom para mais formal..."
              value={aiEditRequest}
              onChange={(e) => setAiEditRequest(e.target.value)}
              rows={4}
              disabled={isEditingWithAI}
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAIEditDialog(false);
                  setAiEditRequest("");
                }}
                className="flex-1"
                disabled={isEditingWithAI}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAIEdit}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                disabled={!aiEditRequest.trim() || isEditingWithAI}
              >
                {isEditingWithAI ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Editando...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Aplicar Edição
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Funnel Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-[400px] bg-card border-accent">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Save className="h-5 w-5 text-accent" />
              Salvar Funil
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Escolha um nome para identificar seu funil.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Nome do funil"
              value={saveFunnelName}
              onChange={(e) => setSaveFunnelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && saveFunnelName.trim()) {
                  handleSaveFunnel(saveFunnelName.trim());
                }
              }}
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveFunnelName("");
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleSaveFunnel(saveFunnelName.trim())}
                className="flex-1 bg-accent hover:bg-accent/90"
                disabled={!saveFunnelName.trim()}
              >
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <main className="container mx-auto px-4 pt-20 pb-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
            Criador de Funil de WhatsApp
          </h2>
          <p className="text-muted-foreground">
            Crie funis de vendas personalizados para WhatsApp em segundos
          </p>
        </div>

        {/* Lista de funis salvos */}
        {showSavedFunnels && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-accent" />
                Seus Funis Salvos
              </h3>
              <Button
                onClick={() => {
                  handleNewFunnel();
                  setShowSavedFunnels(false);
                }}
                className="bg-accent hover:bg-accent/90"
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar Novo Funil
              </Button>
            </div>

            {isLoadingFunnels ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent mx-auto"></div>
                <p className="text-muted-foreground mt-2">Carregando funis...</p>
              </div>
            ) : savedFunnels.length === 0 ? (
              <Card className="border-border bg-card/50 backdrop-blur">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="rounded-full bg-accent/10 p-4 mb-4">
                    <Wand2 className="h-8 w-8 text-accent" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">Nenhum funil salvo</h4>
                  <p className="text-muted-foreground text-center max-w-md mb-4">
                    Crie seu primeiro funil de vendas personalizado para WhatsApp.
                  </p>
                  <Button
                    onClick={() => {
                      handleNewFunnel();
                      setShowSavedFunnels(false);
                    }}
                    className="bg-accent hover:bg-accent/90"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Primeiro Funil
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedFunnels.map((funnel) => (
                  <Card key={funnel.id} className="border-border bg-card/50 backdrop-blur hover:border-accent/50 transition-colors group">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        {editingFunnelId === funnel.id ? (
                          <div className="flex items-center gap-2 flex-1 mr-2">
                            <Input
                              value={editingFunnelName}
                              onChange={(e) => setEditingFunnelName(e.target.value)}
                              className="h-8 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleUpdateFunnelName();
                                if (e.key === "Escape") {
                                  setEditingFunnelId(null);
                                  setEditingFunnelName("");
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              onClick={handleUpdateFunnelName}
                            >
                              <Save className="h-4 w-4 text-accent" />
                            </Button>
                          </div>
                        ) : (
                          <CardTitle 
                            className="text-lg cursor-pointer hover:text-accent transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingFunnelId(funnel.id);
                              setEditingFunnelName(funnel.name);
                            }}
                            title="Clique para editar o nome"
                          >
                            {funnel.name}
                          </CardTitle>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFunnel(funnel.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <CardDescription>
                        Atualizado em {new Date(funnel.updated_at).toLocaleDateString('pt-BR')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="outline"
                        className="w-full border-accent/50 hover:bg-accent/10"
                        onClick={() => handleLoadFunnel(funnel)}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Abrir Funil
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={`grid gap-8 ${showConfig && !generatedFunnel ? 'max-w-xl mx-auto' : 'grid-cols-1 lg:grid-cols-2'}`}>
          {/* Formulário */}
          {showConfig && (
            <Card className="border-border bg-card/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-accent" />
                  Configurações do Funil
                </CardTitle>
                <CardDescription>
                  Preencha as informações para gerar seu funil personalizado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Nicho */}
                <div className="space-y-2">
                  <Label htmlFor="niche">Qual nicho? *</Label>
                  <Select
                    value={formData.niche}
                    onValueChange={(value) => setFormData({ ...formData, niche: value, product: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o nicho" />
                    </SelectTrigger>
                    <SelectContent>
                      {nicheOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.niche === "Outro" && (
                    <Input
                      placeholder="Digite o nicho"
                      value={formData.customNiche}
                      onChange={(e) => setFormData({ ...formData, customNiche: e.target.value })}
                      className="mt-2"
                    />
                  )}
                </div>

                {/* Produto */}
                <div className="space-y-2">
                  <Label htmlFor="product">Qual é o produto? *</Label>
                  {formData.niche && formData.niche !== "Outro" && productExamples[formData.niche]?.length > 0 ? (
                    <Select
                      value={formData.product}
                      onValueChange={(value) => setFormData({ ...formData, product: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {productExamples[formData.niche]?.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="Ex: Curso de Crochê, Ebook de Receitas..."
                      value={formData.product}
                      onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                    />
                  )}
                  {formData.product === "Outro" && (
                    <Input
                      placeholder="Digite o nome do produto"
                      value={formData.customProduct}
                      onChange={(e) => setFormData({ ...formData, customProduct: e.target.value })}
                      className="mt-2"
                    />
                  )}
                </div>

                {/* Nome da Expert */}
                <div className="space-y-2">
                  <Label htmlFor="expertName">Qual o nome da(o) expert? *</Label>
                  <Input
                    placeholder="Ex: Maria, João, Ana..."
                    value={formData.expertName}
                    onChange={(e) => setFormData({ ...formData, expertName: e.target.value })}
                  />
                </div>

                {/* Ângulo */}
                <div className="space-y-2">
                  <Label htmlFor="angle">Qual o ângulo? *</Label>
                  <Select
                    value={formData.angle}
                    onValueChange={(value) => setFormData({ ...formData, angle: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o ângulo" />
                    </SelectTrigger>
                    <SelectContent>
                      {angleOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.angle === "Outro" && (
                    <Input
                      placeholder="Digite o ângulo"
                      value={formData.customAngle}
                      onChange={(e) => setFormData({ ...formData, customAngle: e.target.value })}
                      className="mt-2"
                    />
                  )}
                </div>

                {/* Tom */}
                <div className="space-y-2">
                  <Label htmlFor="tone">Qual tom utilizar no funil? *</Label>
                  <Select
                    value={formData.tone}
                    onValueChange={(value) => setFormData({ ...formData, tone: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tom" />
                    </SelectTrigger>
                    <SelectContent>
                      {toneOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Ticket */}
                <div className="space-y-2">
                  <Label htmlFor="tickets">Qual ticket de venda? *</Label>
                  <TicketTagInput
                    tickets={ticketsList}
                    onChange={setTicketsList}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pressione espaço para adicionar. Arraste para reordenar.
                  </p>
                </div>

                {/* Campos opcionais */}
                <div className="border-t border-border pt-4 mt-4">
                  <p className="text-sm text-muted-foreground mb-4">Campos opcionais (para personalização)</p>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="pixKey">Chave Pix</Label>
                      <Input
                        placeholder="Ex: 11999999999"
                        value={formData.pixKey}
                        onChange={(e) => setFormData({ ...formData, pixKey: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pixKeyType">Tipo de Chave Pix</Label>
                      <Select
                        value={formData.pixKeyType}
                        onValueChange={(value) => setFormData({ ...formData, pixKeyType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo da chave" />
                        </SelectTrigger>
                        <SelectContent>
                          {pixKeyTypeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pixName">Nome que aparece no Pix</Label>
                      <Input
                        placeholder="Ex: Maria Silva, Empresa XYZ..."
                        value={formData.pixName}
                        onChange={(e) => setFormData({ ...formData, pixName: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pixBank">Banco do Pix</Label>
                      <Input
                        placeholder="Ex: Nubank, Itaú, Bradesco..."
                        value={formData.pixBank}
                        onChange={(e) => setFormData({ ...formData, pixBank: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="siteUrl">URL do Site/Produto (opcional)</Label>
                      <Input
                        placeholder="Ex: https://meusite.com"
                        value={formData.siteUrl}
                        onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ebookContent">Conteúdo do E-book/Material (opcional)</Label>
                      <Textarea
                        placeholder="Ex: 50 receitas de bolos, 20 modelos de crochê, guia completo de estudos bíblicos..."
                        value={formData.ebookContent}
                        onChange={(e) => setFormData({ ...formData, ebookContent: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bonus">Bônus (opcional)</Label>
                      <Textarea
                        placeholder="Ex: Lista de fornecedores, grupo VIP, etc..."
                        value={formData.bonus}
                        onChange={(e) => setFormData({ ...formData, bonus: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleGenerateFunnel}
                  disabled={isLoading}
                  className="w-full bg-accent hover:bg-accent/90"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent mr-2" />
                      Gerando Funil...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-5 w-5" />
                      Gerar Funil
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Botões de ação após gerar funil */}
          {!showConfig && generatedFunnel && (
            <Card className="border-border bg-card/50 backdrop-blur lg:col-span-2 mb-4">
              <CardContent className="flex flex-wrap gap-3 py-4">
                <Button
                  variant="outline"
                  onClick={() => setShowAIEditDialog(true)}
                  className="border-purple-500/50 hover:bg-purple-500/10 text-purple-400"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Editar com IA
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowConfig(true)}
                  className="border-accent/50 hover:bg-accent/10"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar Informações
                </Button>
                <Button
                  variant="outline"
                  onClick={handleNewFunnel}
                  className="border-accent/50 hover:bg-accent/10"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Novo Funil
                </Button>
                <Button
                  onClick={() => {
                    if (currentFunnelId) {
                      handleSaveFunnel();
                    } else {
                      setShowSaveDialog(true);
                    }
                  }}
                  className="bg-accent hover:bg-accent/90"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Funil
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Resultado */}
          <div className={`space-y-4 ${!showConfig ? 'lg:col-span-2' : ''}`}>
            {generatedFunnel ? (
              generatedFunnel.sections.map((section, sectionIndex) => (
                <Card key={sectionIndex} className="border-border bg-card/50 backdrop-blur">
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => toggleSection(section.title)}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <span className="text-accent">{sectionIndex + 1}.</span>
                        {section.title}
                      </CardTitle>
                      {expandedSections[section.title] ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <CardDescription>{section.concept}</CardDescription>
                  </CardHeader>
                  
                  {expandedSections[section.title] && (
                    <CardContent className="space-y-4">
                      {section.messages.map((message, messageIndex) => (
                        <div
                          key={messageIndex}
                          className="bg-secondary/50 rounded-lg p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {getMessageIcon(message.type)}
                              <span>{getMessageTypeLabel(message.type)}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(message.content)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {message.instruction ? (
                            <div className="bg-accent/10 border border-accent/20 rounded p-3">
                              <p className="text-sm text-accent font-medium">📌 Instrução:</p>
                              <p className="text-sm text-foreground mt-1">{message.instruction}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {message.content}
                            </p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              ))
            ) : !showConfig ? (
              <Card className="border-border bg-card/50 backdrop-blur">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-full bg-accent/10 p-6 mb-4">
                    <MessageSquare className="h-12 w-12 text-accent" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Seu funil aparecerá aqui</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Preencha as informações ao lado e clique em "Gerar Funil" para criar seu funil de vendas personalizado.
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="mt-16 text-center text-xs text-muted-foreground/50 pb-4">
        Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
      </footer>
    </div>
  );
};

export default WhatsAppFunnelCreator;