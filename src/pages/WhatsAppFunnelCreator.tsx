import { useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Wand2, MessageSquare, Mic, Image, Video, FileText, ChevronDown, ChevronUp } from "lucide-react";

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

const nicheOptions = [
  "Artesanato",
  "Receitas",
  "Religião",
  "Moda e Beleza",
  "Finanças",
  "Saúde e Bem-estar",
  "Desenvolvimento Pessoal",
  "Marketing Digital",
  "Educação",
  "Outro",
];

const productExamples: Record<string, string[]> = {
  "Artesanato": ["Amigurumi", "Crochê", "Kokedama", "Bordado", "Macramê", "Pintura em Tela"],
  "Receitas": ["Bolos Caseiros", "Marmitas Fit", "Doces Gourmet", "Receitas Low Carb", "Confeitaria"],
  "Religião": ["Resumo Bíblico", "Devocional Diário", "Estudos Bíblicos", "Orações Guiadas"],
  "Moda e Beleza": ["Design de Sobrancelhas", "Unhas Decoradas", "Maquiagem", "Corte e Costura"],
  "Finanças": ["Planilha de Gastos", "Investimentos para Iniciantes", "Renda Extra"],
  "Saúde e Bem-estar": ["Yoga", "Meditação", "Emagrecimento", "Treino em Casa"],
  "Desenvolvimento Pessoal": ["Produtividade", "Autoconhecimento", "Liderança", "Comunicação"],
  "Marketing Digital": ["Tráfego Pago", "Copywriting", "Social Media", "Funis de Venda"],
  "Educação": ["Inglês", "Matemática", "Redação", "Concursos"],
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

const WhatsAppFunnelCreator = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [generatedFunnel, setGeneratedFunnel] = useState<GeneratedFunnel | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  
  const [formData, setFormData] = useState({
    niche: "",
    customNiche: "",
    product: "",
    customProduct: "",
    expertName: "",
    angle: "",
    customAngle: "",
    tickets: "",
    pixKey: "",
    pixName: "",
    siteUrl: "",
    bonus: "",
  });

  const handleGenerateFunnel = async () => {
    if (!formData.niche || !formData.product || !formData.expertName || !formData.angle || !formData.tickets) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-whatsapp-funnel", {
        body: {
          niche: formData.niche === "Outro" ? formData.customNiche : formData.niche,
          product: formData.product === "Outro" ? formData.customProduct : formData.product,
          expertName: formData.expertName,
          angle: formData.angle === "Outro" ? formData.customAngle : formData.angle,
          tickets: formData.tickets,
          pixKey: formData.pixKey,
          pixName: formData.pixName,
          siteUrl: formData.siteUrl,
          bonus: formData.bonus,
        },
      });

      if (error) throw error;

      setGeneratedFunnel(data.funnel);
      setExpandedSections(data.funnel.sections.reduce((acc: Record<string, boolean>, section: FunnelSection) => {
        acc[section.title] = true;
        return acc;
      }, {}));

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "Texto copiado para a área de transferência.",
    });
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
      
      <main className="container mx-auto px-4 pt-20 pb-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
            Criador de Funil de WhatsApp
          </h2>
          <p className="text-muted-foreground">
            Crie funis de vendas personalizados para WhatsApp em segundos
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Formulário */}
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

              {/* Ticket */}
              <div className="space-y-2">
                <Label htmlFor="tickets">Qual ticket de venda? *</Label>
                <Input
                  placeholder="Ex: R$24,99 ou R$47 + R$97 (múltiplos valores)"
                  value={formData.tickets}
                  onChange={(e) => setFormData({ ...formData, tickets: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Pode ser um valor único ou múltiplos valores separados por vírgula
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
                    <Label htmlFor="pixName">Nome que aparece no Pix</Label>
                    <Input
                      placeholder="Ex: Maria Silva"
                      value={formData.pixName}
                      onChange={(e) => setFormData({ ...formData, pixName: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="siteUrl">URL do Site/Produto</Label>
                    <Input
                      placeholder="Ex: https://meusite.com"
                      value={formData.siteUrl}
                      onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
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

          {/* Resultado */}
          <div className="space-y-4">
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
            ) : (
              <Card className="border-border bg-card/50 backdrop-blur">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-full bg-accent/10 p-6 mb-4">
                    <MessageSquare className="h-12 w-12 text-accent" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Seu funil aparecerá aqui</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Preencha as informações ao lado e clique em "Gerar Funil" para criar seu funil de WhatsApp personalizado.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default WhatsAppFunnelCreator;
