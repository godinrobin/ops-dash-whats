import { useState, useRef, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  RefreshCw, 
  Copy, 
  Check, 
  ArrowRightLeft, 
  MessageSquare,
  Phone,
  Link as LinkIcon,
  QrCode,
  Wand2
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const ZapConverter = () => {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("number-to-link");

  const formatPhoneNumber = (phone: string): string => {
    // Remove all non-numeric characters
    const numbers = phone.replace(/\D/g, "");
    
    // If starts with 0, remove it
    let formatted = numbers.startsWith("0") ? numbers.slice(1) : numbers;
    
    // If doesn't start with country code, assume Brazil (55)
    if (!formatted.startsWith("55") && formatted.length <= 11) {
      formatted = "55" + formatted;
    }
    
    return formatted;
  };

  const generateWhatsAppLink = (phone: string, message?: string): string => {
    const formatted = formatPhoneNumber(phone);
    const baseUrl = `https://wa.me/${formatted}`;
    
    if (message) {
      return `${baseUrl}?text=${encodeURIComponent(message)}`;
    }
    
    return baseUrl;
  };

  const extractPhoneFromLink = (link: string): string => {
    const match = link.match(/wa\.me\/(\d+)/);
    if (match) {
      return match[1];
    }
    
    const apiMatch = link.match(/api\.whatsapp\.com\/send\?phone=(\d+)/);
    if (apiMatch) {
      return apiMatch[1];
    }
    
    return "";
  };

  const handleConvert = () => {
    if (!input.trim()) {
      toast.error("Digite algo para converter");
      return;
    }

    let result = "";

    switch (activeTab) {
      case "number-to-link":
        result = generateWhatsAppLink(input);
        break;
      case "link-to-number":
        result = extractPhoneFromLink(input);
        if (!result) {
          toast.error("Link inválido");
          return;
        }
        break;
      case "number-with-message":
        const [phone, ...messageParts] = input.split("\n");
        const message = messageParts.join("\n").trim();
        result = generateWhatsAppLink(phone, message);
        break;
      case "bulk-convert":
        const numbers = input.split("\n").filter(n => n.trim());
        result = numbers.map(n => generateWhatsAppLink(n.trim())).join("\n");
        break;
      default:
        result = input;
    }

    setOutput(result);
    toast.success("Convertido com sucesso!");
  };

  const handleCopy = async () => {
    if (!output) return;
    
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      toast.success("Copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar");
    }
  };

  const handleSwap = () => {
    setInput(output);
    setOutput("");
  };

  const getPlaceholder = () => {
    switch (activeTab) {
      case "number-to-link":
        return "Digite o número (ex: 11999998888)";
      case "link-to-number":
        return "Cole o link do WhatsApp (ex: https://wa.me/5511999998888)";
      case "number-with-message":
        return "Número na primeira linha\nMensagem nas próximas linhas\n\nEx:\n11999998888\nOlá! Vi seu anúncio...";
      case "bulk-convert":
        return "Um número por linha:\n11999998888\n11888887777\n11777776666";
      default:
        return "Digite aqui...";
    }
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="container mx-auto max-w-4xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Zap Converter</h1>
            <p className="text-muted-foreground">
              Converta números de WhatsApp em links e vice-versa
            </p>
          </motion.div>

          {/* Converter Card */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-2 lg:grid-cols-4 w-full">
                  <TabsTrigger value="number-to-link" className="text-xs md:text-sm">
                    <Phone className="w-4 h-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">Número → Link</span>
                    <span className="sm:hidden">Nº→Link</span>
                  </TabsTrigger>
                  <TabsTrigger value="link-to-number" className="text-xs md:text-sm">
                    <LinkIcon className="w-4 h-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">Link → Número</span>
                    <span className="sm:hidden">Link→Nº</span>
                  </TabsTrigger>
                  <TabsTrigger value="number-with-message" className="text-xs md:text-sm">
                    <MessageSquare className="w-4 h-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">Com Mensagem</span>
                    <span className="sm:hidden">+Msg</span>
                  </TabsTrigger>
                  <TabsTrigger value="bulk-convert" className="text-xs md:text-sm">
                    <QrCode className="w-4 h-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">Em Massa</span>
                    <span className="sm:hidden">Massa</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Entrada</label>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={getPlaceholder()}
                  className="min-h-[120px] resize-none bg-secondary/30 border-border/50"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  onClick={handleConvert}
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Converter
                </Button>
                
                {output && (
                  <Button
                    variant="outline"
                    onClick={handleSwap}
                    className="border-border/50"
                  >
                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                    Inverter
                  </Button>
                )}
              </div>

              {/* Output */}
              {output && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">Resultado</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Copiar
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <pre className="text-sm text-green-400 whitespace-pre-wrap break-all font-mono">
                      {output}
                    </pre>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Tips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <Card className="bg-card/30 border-border/30">
              <CardContent className="pt-6">
                <Badge variant="secondary" className="mb-2">Dica</Badge>
                <p className="text-sm text-muted-foreground">
                  Não precisa incluir o código do país. Números brasileiros são convertidos automaticamente.
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-card/30 border-border/30">
              <CardContent className="pt-6">
                <Badge variant="secondary" className="mb-2">Formato</Badge>
                <p className="text-sm text-muted-foreground">
                  Aceita números com ou sem formatação: (11) 99999-8888 ou 11999998888
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-card/30 border-border/30">
              <CardContent className="pt-6">
                <Badge variant="secondary" className="mb-2">Em Massa</Badge>
                <p className="text-sm text-muted-foreground">
                  No modo "Em Massa", coloque um número por linha para converter vários de uma vez.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default ZapConverter;
