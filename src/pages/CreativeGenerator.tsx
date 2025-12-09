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
import { Loader2, Download, ArrowLeft, Image as ImageIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

const creativeTemplates = [
  {
    id: "calm-beige",
    name: "Calm Beige Editorial",
    description: "Estilo editorial com tons quentes e aconchegantes, perfeito para produtos artesanais",
    preview: "🏠",
  },
];

const CreativeGenerator = () => {
  const navigate = useNavigate();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
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
          creativeType: selectedTemplate,
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

  const handleBack = () => {
    if (selectedTemplate) {
      setSelectedTemplate(null);
      setGeneratedImage(null);
    } else {
      navigate("/");
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
            onClick={handleBack}
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

          {!selectedTemplate ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {creativeTemplates.map((template) => (
                <Card
                  key={template.id}
                  className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                      <span className="text-6xl">{template.preview}</span>
                    </div>
                    <CardTitle className="text-xl">{template.name}</CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
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
                  <div className="space-y-2">
                    <Label htmlFor="productName">Nome do Produto *</Label>
                    <Input
                      id="productName"
                      placeholder="Ex: Bolsas de Crochê, Tapetes Artesanais..."
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
          )}

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default CreativeGenerator;
