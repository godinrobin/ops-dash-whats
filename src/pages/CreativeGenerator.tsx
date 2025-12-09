import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Download, ArrowLeft, Image as ImageIcon, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import creativeModel1 from "@/assets/creative-model-1.png";
import creativeModel2 from "@/assets/creative-model-2.png";

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
];

const CreativeGenerator = () => {
  const navigate = useNavigate();
  const [selectedModel, setSelectedModel] = useState("calm-beige");
  const [productName, setProductName] = useState("");
  const [includePrice, setIncludePrice] = useState(false);
  const [price, setPrice] = useState("");
  const [observation, setObservation] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!productName.trim()) {
      toast.error("Por favor, informe o nome do produto");
      return;
    }

    if (includePrice && !price.trim()) {
      toast.error("Por favor, informe o valor do produto");
      return;
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
                {/* Model Selection */}
                <div className="space-y-3">
                  <Label>Modelo *</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {modelOptions.map((model) => (
                      <div
                        key={model.id}
                        onClick={() => !isGenerating && setSelectedModel(model.id)}
                        className={`relative cursor-pointer rounded-lg border-2 p-3 transition-all ${
                          selectedModel === model.id
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-accent/50"
                        } ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {selectedModel === model.id && (
                          <div className="absolute top-2 right-2 bg-accent text-accent-foreground rounded-full p-1">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                        <img
                          src={model.preview}
                          alt={model.name}
                          className="w-full h-32 object-cover rounded-md mb-2"
                        />
                        <p className="font-medium text-sm">{model.name}</p>
                        <p className="text-xs text-muted-foreground">{model.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="productName">Nome do Produto *</Label>
                  <Input
                    id="productName"
                    placeholder="Ex: Bolsas de Crochê, Resina Epóxi, Tapetes Artesanais..."
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
                  disabled={isGenerating || !productName.trim()}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando criativo...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Gerar Criativo
                    </>
                  )}
                </Button>
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
                  <Button
                    onClick={handleDownload}
                    className="w-full"
                    size="lg"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Criativo
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default CreativeGenerator;
