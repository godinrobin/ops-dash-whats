import { useState, useRef } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Download, ArrowLeft, Image as ImageIcon, Check, Sparkles, Send, Info, Clock, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useGenerationCooldown } from "@/hooks/useGenerationCooldown";
import { Spinner } from "@/components/ui/spinner-1";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { useCredits } from "@/hooks/useCredits";
import { useFreeTierUsage } from "@/hooks/useFreeTierUsage";
import { SystemCreditBadge } from "@/components/credits/SystemCreditBadge";
import { InsufficientCreditsModal } from "@/components/credits/InsufficientCreditsModal";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import creativeModel1 from "@/assets/creative-model-1.png";
import creativeModel2 from "@/assets/creative-model-2.png";
import creativeModel3 from "@/assets/creative-model-3.png";
import creativeModel4 from "@/assets/creative-model-4.png";
import creativeModel5 from "@/assets/creative-model-5.png";
import creativeModel6 from "@/assets/creative-model-6.png";
import creativeModel7 from "@/assets/creative-model-7.png";
import creativeModel8 from "@/assets/creative-model-8.png";
import creativeModel9 from "@/assets/creative-model-9.png";
import creativeModel10 from "@/assets/creative-model-10.png";
import creativeModel11 from "@/assets/creative-model-11.png";

const modelOptions = [
  {
    id: "calm-beige",
    name: "Modelo 1 - Calm Beige Editorial",
    description: "Estilo editorial com tons quentes, 3 produtos sobre mesa de madeira",
    preview: creativeModel1,
  },
  {
    id: "curso-criativo",
    name: "Modelo 2 - Curso Criativo",
    description: "Layout dividido com produto artesanal e texto promocional de curso",
    preview: creativeModel2,
  },
  {
    id: "cartoon-cristao",
    name: "Modelo 3 - Cartoon Cristão",
    description: "Ilustração infantil cristã estilo chibi com cores quentes",
    preview: creativeModel3,
  },
  {
    id: "estudo-cinematico",
    name: "Modelo 4 - Estudo Cinematográfico",
    description: "Anúncio profissional estilo cinematográfico com pessoa estudando",
    preview: creativeModel4,
  },
  {
    id: "vintage-religioso",
    name: "Modelo 5 - Vintage Religioso",
    description: "Arte promocional estilo vintage com estética bíblica dourada",
    preview: creativeModel5,
  },
  {
    id: "calistenia-urbano",
    name: "Modelo 6 - Calistenia Urbano",
    description: "Estilo anúncio fitness com pessoa em exercício e visual impactante",
    preview: creativeModel6,
  },
  {
    id: "curso-tecnico-cartoon",
    name: "Modelo 7 - Curso Técnico Cartoon",
    description: "Ilustração vetorial semi-realista estilo infográfico educativo",
    preview: creativeModel7,
  },
  {
    id: "curso-tecnico-realista",
    name: "Modelo 8 - Curso Técnico Realista",
    description: "Anúncio profissional com personagem realista e visual tecnológico",
    preview: creativeModel8,
  },
  {
    id: "fitness-urgente",
    name: "Modelo 9 - Fitness Urgente",
    description: "Estilo urgência com transformação, fogo e apelo emocional forte",
    preview: creativeModel9,
  },
  {
    id: "whatsapp-mobile",
    name: "Modelo 10 - WhatsApp Mobile",
    description: "Mockup de celular com biblioteca de conteúdos e entrega por WhatsApp",
    preview: creativeModel10,
  },
  {
    id: "fitness-energetico",
    name: "Modelo 11 - Fitness Energético",
    description: "Visual energético com personagem fitness e benefícios destacados",
    preview: creativeModel11,
  },
];

const CreativeGenerator = () => {
  useActivityTracker("page_visit", "Gerador de Criativo");
  const navigate = useNavigate();
  const { canGenerate, formattedTime, startCooldown, isAdmin } = useGenerationCooldown("creative_last_generation");
  
  // Credits system hooks
  const { isActive: isCreditsActive, isSemiFullMember } = useCreditsSystem();
  const { deductCredits, canAfford } = useCredits();
  const { getUsage, incrementUsage, hasFreeTier, getRemainingFree } = useFreeTierUsage();
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false);
  
  const CREDIT_COST = 0.20;
  const SYSTEM_ID = 'gerador_criativos';
  
  const [selectedModel, setSelectedModel] = useState("calm-beige");
  const [productName, setProductName] = useState("");
  const [includePrice, setIncludePrice] = useState(false);
  const [price, setPrice] = useState("");
  const [observation, setObservation] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [showAIEditDialog, setShowAIEditDialog] = useState(false);
  const [aiEditRequest, setAiEditRequest] = useState("");
  const [isEditingWithAI, setIsEditingWithAI] = useState(false);

  // Reference image states
  const [showReferenceDialog, setShowReferenceDialog] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceAnalysis, setReferenceAnalysis] = useState<any>(null);
  const [referenceInstructions, setReferenceInstructions] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingFromRef, setIsGeneratingFromRef] = useState(false);
  const [refGeneratedImage, setRefGeneratedImage] = useState<string | null>(null);
  const [refStep, setRefStep] = useState<'upload' | 'analyze' | 'edit' | 'result'>('upload');
  const [refEditInstructions, setRefEditInstructions] = useState("");
  const [isEditingRef, setIsEditingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error(`Aguarde ${formattedTime} para gerar uma nova imagem`);
      return;
    }

    if (!productName.trim()) {
      toast.error("Por favor, informe o nome do produto");
      return;
    }

    if (includePrice && !price.trim()) {
      toast.error("Por favor, informe o valor do produto");
      return;
    }

    // Credit system check (active for credits system users and semi-full members)
    if (isCreditsActive || isSemiFullMember) {
      const usage = getUsage(SYSTEM_ID);
      const isInFreeTier = hasFreeTier(SYSTEM_ID) && usage.canUse;
      
      if (!isInFreeTier) {
        // Need to pay with credits
        if (!canAfford(CREDIT_COST)) {
          setShowInsufficientCredits(true);
          return;
        }
        
        // Deduct credits
        const success = await deductCredits(
          CREDIT_COST,
          SYSTEM_ID,
          'Geração de criativo'
        );
        
        if (!success) {
          setShowInsufficientCredits(true);
          return;
        }
      } else {
        // Increment free tier usage
        await incrementUsage(SYSTEM_ID);
      }
    }

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-creative-image', {
        body: {
          productName: productName.trim(),
          includePrice,
          price: price.trim(),
          observation: observation.trim(),
          modelType: selectedModel,
        },
      });

      if (error) throw error;

      if (data.success && data.image) {
        setGeneratedImage(data.image);
        startCooldown();
        toast.success("Criativo gerado com sucesso!");
      } else {
        throw new Error(data.error || "Erro ao gerar imagem");
      }
    } catch (error: any) {
      console.error("Error generating creative:", error);
      toast.error(error.message || "Erro ao gerar criativo");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `criativo-${productName.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Download iniciado!");
  };

  const handleAIEdit = async () => {
    if (!aiEditRequest.trim() || !generatedImage) return;

    setIsEditingWithAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('edit-creative-with-ai', {
        body: {
          currentImageUrl: generatedImage,
          editRequest: aiEditRequest.trim(),
          productName: productName.trim(),
          modelType: selectedModel,
        },
      });

      if (error) throw error;

      if (data.success && data.image) {
        setGeneratedImage(data.image);
        toast.success("Criativo editado com sucesso!");
        setAiEditRequest("");
        setShowAIEditDialog(false);
      } else {
        throw new Error(data.error || "Erro ao editar imagem");
      }
    } catch (error: any) {
      console.error("Error editing creative:", error);
      toast.error(error.message || "Erro ao editar criativo");
    } finally {
      setIsEditingWithAI(false);
    }
  };

  // Reference image handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor, selecione uma imagem válida');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setReferenceImage(reader.result as string);
        setRefStep('analyze');
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              setReferenceImage(reader.result as string);
              setRefStep('analyze');
            };
            reader.readAsDataURL(file);
          }
        }
      }
    }
  };

  const analyzeReference = async () => {
    if (!referenceImage) return;

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-from-reference', {
        body: {
          referenceImageUrl: referenceImage,
          editInstructions: '',
        },
      });

      if (error) throw error;

      if (data.success && data.analysis) {
        setReferenceAnalysis(data.analysis);
        setRefStep('edit');
        toast.success('Imagem analisada com sucesso!');
      } else {
        throw new Error(data.error || 'Erro ao analisar imagem');
      }
    } catch (error: any) {
      console.error('Error analyzing reference:', error);
      toast.error(error.message || 'Erro ao analisar imagem');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateFromReference = async () => {
    if (!referenceImage) return;
    
    if (!referenceInstructions.trim()) {
      toast.error('Por favor, descreva as alterações desejadas');
      return;
    }

    setIsGeneratingFromRef(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-from-reference', {
        body: {
          referenceImageUrl: referenceImage,
          editInstructions: referenceInstructions.trim(),
        },
      });

      if (error) throw error;

      if (data.success && data.image) {
        setRefGeneratedImage(data.image);
        setRefStep('result');
        startCooldown();
        toast.success('Criativo gerado com sucesso!');
      } else {
        throw new Error(data.error || 'Erro ao gerar criativo');
      }
    } catch (error: any) {
      console.error('Error generating from reference:', error);
      toast.error(error.message || 'Erro ao gerar criativo');
    } finally {
      setIsGeneratingFromRef(false);
    }
  };

  const handleDownloadRef = () => {
    if (!refGeneratedImage) return;
    const link = document.createElement('a');
    link.href = refGeneratedImage;
    link.download = `criativo-referencia-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Download iniciado!');
  };

  const resetReferenceDialog = () => {
    setReferenceImage(null);
    setReferenceAnalysis(null);
    setReferenceInstructions('');
    setRefGeneratedImage(null);
    setRefStep('upload');
    setRefEditInstructions('');
  };

  const handleEditRefImage = async () => {
    if (!refEditInstructions.trim() || !refGeneratedImage) return;

    setIsEditingRef(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-from-reference', {
        body: {
          referenceImageUrl: refGeneratedImage,
          editInstructions: refEditInstructions.trim(),
        },
      });

      if (error) throw error;

      if (data.success && data.image) {
        setRefGeneratedImage(data.image);
        setRefEditInstructions('');
        toast.success('Criativo editado com sucesso!');
      } else {
        throw new Error(data.error || 'Erro ao editar criativo');
      }
    } catch (error: any) {
      console.error('Error editing reference creative:', error);
      toast.error(error.message || 'Erro ao editar criativo');
    } finally {
      setIsEditingRef(false);
    }
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">🎨 Gerador de Criativos</h1>
            <p className="text-muted-foreground">
              Crie imagens profissionais para seus anúncios com IA
            </p>
          </header>

          <div className="space-y-6">
            <Card className="border-2 border-accent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Configurar Criativo
                </CardTitle>
                <CardDescription>
                  Preencha as informações abaixo para gerar seu criativo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Model Selection - Carousel */}
                <div className="space-y-3">
                  <Label>Modelo *</Label>
                  <p className="text-xs text-muted-foreground -mt-1">Arraste para o lado para ver mais opções</p>
                  <Carousel
                    opts={{
                      align: "start",
                      loop: false,
                    }}
                    className="w-full"
                  >
                    <CarouselContent className="-ml-2 md:-ml-4">
                      {modelOptions.map((model) => (
                        <CarouselItem key={model.id} className="pl-2 md:pl-4 basis-1/2 md:basis-1/3 lg:basis-1/4">
                          <div
                            onClick={() => !isGenerating && setSelectedModel(model.id)}
                            className={`relative cursor-pointer rounded-lg border-2 p-2 transition-all h-full ${
                              selectedModel === model.id
                                ? "border-accent bg-accent/10"
                                : "border-border hover:border-accent/50"
                            } ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {selectedModel === model.id && (
                              <div className="absolute top-1 right-1 bg-accent text-accent-foreground rounded-full p-0.5 z-10">
                                <Check className="h-2.5 w-2.5" />
                              </div>
                            )}
                            <img
                              src={model.preview}
                              alt={model.name}
                              className="w-full aspect-square object-cover rounded-md mb-1.5"
                            />
                            <p className="font-medium text-xs leading-tight">{model.name}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{model.description}</p>
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious className="hidden md:flex -left-4" />
                    <CarouselNext className="hidden md:flex -right-4" />
                  </Carousel>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="productName">Nome do Produto / Tema *</Label>
                  <Input
                    id="productName"
                    placeholder="Ex: Bolsas de Crochê, Memorize a Bíblia, Livros para Colorir..."
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    disabled={isGenerating}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="includePrice">Deseja informar o valor no criativo?</Label>
                    <p className="text-sm text-muted-foreground">
                      Adicione o preço do produto na imagem
                    </p>
                  </div>
                  <Switch
                    id="includePrice"
                    checked={includePrice}
                    onCheckedChange={setIncludePrice}
                    disabled={isGenerating}
                    className="data-[state=checked]:bg-green-600"
                  />
                </div>

                {includePrice && (
                  <div className="space-y-2">
                    <Label htmlFor="price">Valor do Produto</Label>
                    <Input
                      id="price"
                      placeholder="Ex: 29,90"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      disabled={isGenerating}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="observation">Observação (opcional)</Label>
                  <Textarea
                    id="observation"
                    placeholder="Adicione instruções extras para personalizar seu criativo..."
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    disabled={isGenerating}
                    rows={3}
                  />
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !productName.trim() || !canGenerate}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando criativo...
                    </>
                  ) : !canGenerate ? (
                    <>
                      <Clock className="h-4 w-4 mr-2" />
                      Aguarde {formattedTime}
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Gerar Criativo
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => {
                    resetReferenceDialog();
                    setShowReferenceDialog(true);
                  }}
                  variant="outline"
                  className="w-full border-accent text-accent-foreground hover:bg-accent/10"
                  size="lg"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Envie Imagem de Referência
                </Button>
                
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5 pt-2">
                  <Info className="h-3 w-3" />
                  Quanto mais informações der para criação da imagem, mais assertivo será o resultado.
                </p>
              </CardContent>
            </Card>

            {generatedImage && (
              <Card className="border-2 border-accent">
                <CardHeader>
                  <CardTitle>Criativo Gerado</CardTitle>
                  <CardDescription>
                    Seu criativo está pronto! Clique para baixar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden border border-border">
                    <img
                      src={generatedImage}
                      alt="Criativo gerado"
                      className="w-full h-auto"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => setShowAIEditDialog(true)}
                      variant="outline"
                      className="flex-1 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                      size="lg"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Editar com IA
                    </Button>
                    <Button
                      onClick={handleDownload}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      size="lg"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Baixar Criativo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Edit Dialog */}
            <Dialog open={showAIEditDialog} onOpenChange={setShowAIEditDialog}>
              <DialogContent className="sm:max-w-[500px] bg-card border-purple-500">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <Sparkles className="h-5 w-5 text-purple-400" />
                    Editar Criativo com IA
                  </DialogTitle>
                  <DialogDescription className="text-base pt-2">
                    Descreva qual alteração você deseja fazer no criativo e a IA irá gerar uma nova versão.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <Textarea
                    placeholder="Ex: Mude a cor do fundo para azul, adicione mais produtos na imagem, coloque um texto diferente..."
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

            {/* Reference Image Dialog */}
            <Dialog 
              open={showReferenceDialog} 
              onOpenChange={(open) => {
                if (!open) resetReferenceDialog();
                setShowReferenceDialog(open);
              }}
            >
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-card border-accent">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <Upload className="h-5 w-5 text-accent" />
                    Criar a partir de Referência
                  </DialogTitle>
                  <DialogDescription className="text-base pt-2">
                    Faça upload de uma imagem de referência e a IA irá analisar e gerar um novo criativo baseado nela.
                  </DialogDescription>
                </DialogHeader>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="py-4 space-y-4" onPaste={handlePaste}>
                  {/* Step 1: Upload */}
                  {refStep === 'upload' && (
                    <div className="space-y-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-accent/50 transition-colors"
                      >
                        <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium mb-2">Clique para fazer upload</p>
                        <p className="text-sm text-muted-foreground">ou cole uma imagem (Ctrl+V)</p>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Analyze */}
                  {refStep === 'analyze' && referenceImage && (
                    <div className="space-y-4">
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img
                          src={referenceImage}
                          alt="Imagem de referência"
                          className="w-full h-auto max-h-64 object-contain"
                        />
                        {isAnalyzing && (
                          <div className="absolute inset-0 bg-accent/20 backdrop-blur-sm flex items-center justify-center">
                            <Spinner size={48} />
                          </div>
                        )}
                        {!isAnalyzing && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 bg-background/80 hover:bg-background"
                            onClick={() => {
                              setReferenceImage(null);
                              setRefStep('upload');
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <Button
                        onClick={analyzeReference}
                        disabled={isAnalyzing}
                        className="w-full"
                        size="lg"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Analisando imagem...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Analisar Referência
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Step 3: Edit instructions */}
                  {refStep === 'edit' && referenceImage && (
                    <div className="space-y-4">
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img
                          src={referenceImage}
                          alt="Imagem de referência"
                          className="w-full h-auto max-h-48 object-contain"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Alterações desejadas *</Label>
                        <Textarea
                          placeholder="Ex: Troque o produto por bolsas, mude as cores para tons de azul, adicione texto 'Promoção'..."
                          value={referenceInstructions}
                          onChange={(e) => setReferenceInstructions(e.target.value)}
                          rows={3}
                          disabled={isGeneratingFromRef}
                        />
                      </div>

                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          onClick={() => setRefStep('analyze')}
                          className="flex-1"
                          disabled={isGeneratingFromRef}
                        >
                          Voltar
                        </Button>
                        <Button
                          onClick={generateFromReference}
                          disabled={isGeneratingFromRef || !canGenerate || !referenceInstructions.trim()}
                          className="flex-1"
                        >
                          {isGeneratingFromRef ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Gerando...
                            </>
                          ) : !canGenerate ? (
                            <>
                              <Clock className="h-4 w-4 mr-2" />
                              Aguarde {formattedTime}
                            </>
                          ) : (
                            <>
                              <ImageIcon className="h-4 w-4 mr-2" />
                              Gerar Criativo
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Result */}
                  {refStep === 'result' && refGeneratedImage && (
                    <div className="space-y-4">
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img
                          src={refGeneratedImage}
                          alt="Criativo gerado"
                          className="w-full h-auto"
                        />
                        {isEditingRef && (
                          <div className="absolute inset-0 bg-accent/20 backdrop-blur-sm flex items-center justify-center">
                            <Spinner size={48} />
                          </div>
                        )}
                      </div>
                      
                      {/* Edit with AI section */}
                      <div className="space-y-2 p-4 rounded-lg border border-accent/30 bg-accent/5">
                        <Label className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-accent" />
                          Editar com IA
                        </Label>
                        <Textarea
                          placeholder="Ex: Mude a cor do fundo para azul, adicione mais produtos, altere o texto..."
                          value={refEditInstructions}
                          onChange={(e) => setRefEditInstructions(e.target.value)}
                          rows={2}
                          disabled={isEditingRef}
                        />
                        <Button
                          onClick={handleEditRefImage}
                          disabled={isEditingRef || !refEditInstructions.trim()}
                          className="w-full"
                          variant="outline"
                        >
                          {isEditingRef ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Aplicando edição...
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2" />
                              Aplicar Edição
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setRefGeneratedImage(null);
                            setRefStep('edit');
                            setRefEditInstructions('');
                          }}
                          className="flex-1"
                          disabled={isEditingRef}
                        >
                          Nova Referência
                        </Button>
                        <Button
                          onClick={handleDownloadRef}
                          className="flex-1"
                          disabled={isEditingRef}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Baixar Criativo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        open={showInsufficientCredits}
        onOpenChange={setShowInsufficientCredits}
        requiredCredits={CREDIT_COST}
        systemName="Gerador de Criativos"
      />
    </>
  );
};

export default CreativeGenerator;
