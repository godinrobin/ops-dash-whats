import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { ChatMessage, ConversationStep } from "@/pages/DeliverableCreator";

interface DeliverableChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isGenerating: boolean;
  step: ConversationStep;
}

export const DeliverableChatPanel = ({
  messages,
  onSendMessage,
  isGenerating,
  step,
}: DeliverableChatPanelProps) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  useEffect(() => {
    if (!isGenerating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isGenerating, step]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    
    onSendMessage(input.trim());
    setInput("");
  };

  const getPlaceholder = () => {
    switch (step) {
      case "ask_niche":
        return "Digite o nicho (ex: Artesanato em Resina)...";
      case "ask_primary_color":
        return "Digite a cor principal (ex: rosa, #E91E63)...";
      case "ask_secondary_color":
        return "Digite a cor secundária...";
      case "ask_audience":
        return "Descreva seu público-alvo...";
      case "ask_videos":
        return "Responda sim ou não...";
      case "ask_video_links":
        return "Cole o link do vídeo ou digite 'pronto'...";
      case "editing":
        return "Peça modificações ou ajustes...";
      default:
        return "Digite sua mensagem...";
    }
  };

  const renderMessage = (message: ChatMessage, index: number) => {
    const isUser = message.role === "user";

    return (
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isUser
              ? "bg-accent text-accent-foreground"
              : "bg-primary/10 text-primary"
          }`}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
        <div
          className={`flex-1 px-4 py-3 rounded-2xl max-w-[80%] ${
            isUser
              ? "bg-accent text-accent-foreground ml-auto"
              : "bg-secondary/50"
          }`}
        >
          <div 
            className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ 
              __html: message.content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br/>')
            }}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-background">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Assistente IA</h3>
            <p className="text-xs text-muted-foreground">
              {isGenerating ? "Gerando..." : "Online"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4" ref={scrollRef}>
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => renderMessage(message, index))}
          </AnimatePresence>

          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-secondary/50 px-4 py-3 rounded-2xl">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    Processando...
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-background">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={getPlaceholder()}
            disabled={isGenerating || step === "generating"}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isGenerating || step === "generating"}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};
