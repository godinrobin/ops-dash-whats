import { useState, useRef, useCallback, useEffect } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowUp, Loader2, Key, Sparkles, Search, Hash, Lightbulb } from "lucide-react";
import { ResponseStream } from "@/components/ui/response-stream";
import { motion } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `Você é um assistente especializado em gerar palavras-chave para pesquisar anúncios no gerenciador de anúncios do Facebook/Meta. Seu foco são anúncios de WhatsApp (vendas pelo WhatsApp, X1, etc).

NICHOS QUE VOCÊ CONHECE BEM:
- Religião: palavras relacionadas a fé, orações, produtos religiosos, bíblias, terços, etc.
- Artesanato: palavras sobre artesanato, crochê, bordado, tricô, DIY, cursos de artesanato
- Receitas: palavras sobre culinária, receitas, confeitaria, bolos, salgados, marmitas fit
- Educação: palavras sobre cursos, ebooks, mentorias, treinamentos, aulas particulares

REGRAS:
1. Só responda sobre palavras-chave para anúncios. Se perguntarem sobre outros assuntos, diga: "Desculpe, fui configurada apenas para ajudar com palavras-chave para anúncios de WhatsApp. Como posso ajudar nesse tema?"

2. Ao sugerir palavras-chave, inclua:
   - Palavras do nicho específico
   - Variações com "whatsapp", "zap", "chama no zap"
   - CTAs comuns: "fale comigo", "converse conosco", "chama no direct", "link na bio"
   - Termos de urgência: "vagas limitadas", "última chance", "promoção"

3. No FINAL de TODA resposta com sugestões, adicione:
   "💡 Dica: Use a extensão do Zapdata para filtrar apenas anúncios de WhatsApp! E experimente adicionar '+whatsapp' no final das palavras-chave para encontrar mais ofertas."

4. Se pedirem nichos que você não conhece bem, use sua criatividade baseada nos padrões dos nichos conhecidos. Anúncios de WhatsApp geralmente têm CTAs de contato direto.

5. Formate as palavras-chave em listas organizadas e fáceis de copiar.

6. Seja amigável e prestativo, mas sempre focado em palavras-chave para anúncios.`;

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
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background flex flex-col">
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
                      <ResponseStream
                        textStream={message.content}
                        mode="fade"
                        speed={50}
                        className="text-sm whitespace-pre-wrap"
                      />
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
    </>
  );
};

export default GeradorPalavrasChaves;
