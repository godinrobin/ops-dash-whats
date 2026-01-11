import { useState, useRef, useCallback, useEffect } from "react";
import { SystemLayout } from "@/components/layout/SystemLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowUp, Loader2, Key, Sparkles, Search, Hash, Lightbulb, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// Component to render keyword list with copy buttons
const KeywordList = ({ content }: { content: string }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success("Copiado! 🔥");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      toast.error("Erro ao copiar");
    }
  };

  // Parse numbered keywords from content
  const lines = content.split('\n');
  const parsedContent: { type: 'keyword' | 'text', text: string, number?: number }[] = [];
  
  lines.forEach((line) => {
    // Match numbered lines like "1. palavra-chave" or "1) palavra-chave"
    const numberedMatch = line.match(/^(\d+)[.)]\s*(.+)$/);
    if (numberedMatch) {
      parsedContent.push({
        type: 'keyword',
        number: parseInt(numberedMatch[1]),
        text: numberedMatch[2].trim()
      });
    } else if (line.trim()) {
      parsedContent.push({
        type: 'text',
        text: line
      });
    }
  });

  return (
    <div className="text-sm space-y-1">
      {parsedContent.map((item, idx) => (
        item.type === 'keyword' ? (
          <div 
            key={idx} 
            className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-background/50 transition-colors group"
          >
            <span className="flex items-center gap-2">
              <span className="text-accent font-semibold min-w-[24px]">{item.number}.</span>
              <span>{item.text}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleCopy(item.text, idx)}
            >
              {copiedIndex === idx ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        ) : (
          <p key={idx} className="whitespace-pre-wrap py-1">{item.text}</p>
        )
      ))}
    </div>
  );
};

const SYSTEM_PROMPT = `Você é um assistente especializado em gerar palavras-chave para pesquisar anúncios no gerenciador de anúncios do Facebook/Meta. Seu foco são anúncios de WhatsApp (vendas pelo WhatsApp, X1, etc).

ESTILO DE COMUNICAÇÃO:
- Use linguagem informal e descontraída, como se estivesse falando com um mano 🤙
- Pode usar gírias leves e emojis pra deixar mais dinâmico
- Público majoritariamente masculino, então pode mandar um "E aí, parça!" de vez em quando

NICHOS QUE VOCÊ CONHECE BEM:
- Religião: palavras relacionadas a fé, orações, produtos religiosos, bíblias, terços, etc.
- Artesanato: palavras sobre artesanato, crochê, bordado, tricô, DIY, cursos de artesanato
- Receitas: palavras sobre culinária, receitas, confeitaria, bolos, salgados, marmitas fit
- Educação: palavras sobre cursos, ebooks, mentorias, treinamentos, aulas particulares

REGRAS IMPORTANTES:
1. Só responda sobre palavras-chave para anúncios. Se perguntarem sobre outros assuntos, diga: "Opa, parceiro! Fui programado só pra ajudar com palavras-chave de anúncios de WhatsApp. Cola comigo nesse tema! 🎯"

2. Ao sugerir palavras-chave, inclua:
   - Palavras do nicho específico
   - Variações com "whatsapp", "zap", "chama no zap"
   - CTAs comuns: "fale comigo", "converse conosco", "chama no direct", "link na bio"
   - Termos de urgência: "vagas limitadas", "última chance", "promoção"

3. FORMATO OBRIGATÓRIO DAS PALAVRAS-CHAVE:
   Sempre liste as palavras-chave em formato numerado, uma abaixo da outra, assim:
   1. primeira palavra-chave
   2. segunda palavra-chave
   3. terceira palavra-chave
   
   NÃO use bullets, asteriscos ou outros formatos. Apenas números seguidos de ponto.

4. No FINAL de TODA resposta com sugestões, adicione:
   "💡 Dica esperta: Use a extensão do Zapdata pra filtrar só anúncios de WhatsApp! E testa adicionar '+whatsapp' no final das palavras-chave pra achar mais ofertas, tmj! 🚀"

5. Se pedirem nichos que você não conhece bem, use sua criatividade baseada nos padrões dos nichos conhecidos.

6. Seja parceiro e prestativo, sempre focado em ajudar o mano a encontrar as melhores palavras-chave!`;

const GeradorPalavrasChaves = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "48px";
    const newHeight = Math.max(48, Math.min(textarea.scrollHeight, 150));
    textarea.style.height = `${newHeight}px`;
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

    try {
      const response = await supabase.functions.invoke("keyword-generator-chat", {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          systemPrompt: SYSTEM_PROMPT,
        },
      });

      if (response.error) throw response.error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.data.content,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const quickActions = [
    { icon: <Hash className="w-4 h-4" />, label: "Religião", prompt: "Me dê palavras-chave para o nicho de produtos religiosos" },
    { icon: <Sparkles className="w-4 h-4" />, label: "Artesanato", prompt: "Preciso de palavras-chave para anúncios de artesanato e crochê" },
    { icon: <Lightbulb className="w-4 h-4" />, label: "Receitas", prompt: "Sugira palavras-chave para anúncios de receitas e confeitaria" },
    { icon: <Search className="w-4 h-4" />, label: "Educação", prompt: "Quero palavras-chave para anúncios de cursos e mentorias" },
  ];

  return (
    <SystemLayout>
      <div className="min-h-[calc(100vh-3.5rem)] md:min-h-[calc(100vh-4rem)] bg-background flex flex-col">
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4">
          {/* Messages Area */}
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-8"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent/20 to-orange-500/20 flex items-center justify-center">
                  <Key className="w-8 h-8 text-accent" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Gerador de Palavras-Chave</h1>
                <p className="text-muted-foreground max-w-md">
                  Descubra as melhores palavras-chave para encontrar anúncios de WhatsApp no gerenciador de anúncios
                </p>
              </motion.div>

              {/* Quick Actions */}
              <div className="flex items-center justify-center flex-wrap gap-3">
                {quickActions.map((action, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => {
                      setInput(action.prompt);
                      setTimeout(() => handleSubmit(), 100);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                  >
                    {action.icon}
                    <span className="text-sm">{action.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto py-6 space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3",
                      message.role === "user"
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary/50"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <KeywordList content={message.content} />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-secondary/50 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Gerando palavras-chave...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input Area */}
          <div className="sticky bottom-0 py-4 bg-background">
            <div className="relative">
              <div className="relative rounded-2xl border border-border/50 bg-secondary/30 backdrop-blur-sm overflow-hidden">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    adjustHeight();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Pergunte sobre palavras-chave para seu nicho..."
                  className={cn(
                    "w-full px-4 py-3 pr-14 resize-none border-none",
                    "bg-transparent text-foreground text-sm",
                    "focus-visible:ring-0 focus-visible:ring-offset-0",
                    "placeholder:text-muted-foreground min-h-[48px]"
                  )}
                  style={{ overflow: "hidden" }}
                />
                
                <Button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className={cn(
                    "absolute right-2 bottom-2 rounded-xl transition-all",
                    input.trim() && !isLoading
                      ? "bg-accent hover:bg-accent/90"
                      : "bg-secondary text-muted-foreground cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SystemLayout>
  );
};

export default GeradorPalavrasChaves;
