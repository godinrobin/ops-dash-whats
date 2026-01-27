import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, Bot, User, Loader2, Paperclip, X, FileText, Video, Image as ImageIcon, Lightbulb } from "lucide-react";
import { ChatMessage, ConversationStep, AttachmentType } from "@/pages/DeliverableCreator";

type Attachment = {
  url: string;
  type: AttachmentType;
  name?: string;
};

interface DeliverableChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string, attachment?: Attachment, isChatMode?: boolean) => void;
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
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isChatMode, setIsChatMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Handle paste event for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;

          const reader = new FileReader();
          reader.onload = (event) => {
            setAttachment({
              url: event.target?.result as string,
              type: "image",
              name: file.name
            });
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  const getFileType = (file: File): AttachmentType | null => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type === "application/pdf") return "pdf";
    if (file.type.startsWith("video/")) return "video";
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !attachment) || isGenerating) return;
    
    onSendMessage(input.trim(), attachment || undefined);
    setInput("");
    setAttachment(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = getFileType(file);
    if (!fileType) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachment({
        url: event.target?.result as string,
        type: fileType,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
  };

  const getAttachmentIcon = (type: AttachmentType) => {
    switch (type) {
      case "pdf":
        return <FileText className="w-6 h-6 text-red-500" />;
      case "video":
        return <Video className="w-6 h-6 text-blue-500" />;
      default:
        return <ImageIcon className="w-6 h-6 text-green-500" />;
    }
  };

  const getPlaceholder = () => {
    if (isChatMode) {
      return "Converse livremente sobre o projeto...";
    }
    switch (step) {
      case "ask_niche":
        return "Digite o nicho (ex: Artesanato em Resina)...";
      case "ask_primary_color":
        return "Digite a cor principal (ex: rosa, #E91E63)...";
      case "ask_secondary_color":
        return "Digite a cor secundária...";
      case "ask_audience":
        return "Descreva seu público-alvo...";
      case "ask_product_details":
        return "Conte mais sobre o produto/curso...";
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
          {/* Show attachment if present */}
          {message.imageUrl && (
            <div className="mb-2">
              {message.attachmentType === "pdf" ? (
                <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg border">
                  <FileText className="w-5 h-5 text-red-500" />
                  <span className="text-sm truncate">{message.attachmentName || "Documento PDF"}</span>
                </div>
              ) : message.attachmentType === "video" ? (
                <video 
                  src={message.imageUrl} 
                  controls 
                  className="max-w-full h-auto rounded-lg max-h-48"
                />
              ) : (
                <img 
                  src={message.imageUrl} 
                  alt="Uploaded" 
                  className="max-w-full h-auto rounded-lg max-h-48 object-contain"
                />
              )}
            </div>
          )}
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
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-border bg-background flex-shrink-0">
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
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 p-4" ref={scrollRef}>
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

      {/* Attachment Preview */}
      {attachment && (
        <div className="px-4 pb-2">
          <div className="relative inline-block">
            {attachment.type === "image" ? (
              <img 
                src={attachment.url} 
                alt="Preview" 
                className="h-20 w-auto rounded-lg border border-border"
              />
            ) : attachment.type === "video" ? (
              <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border border-border">
                <Video className="w-6 h-6 text-blue-500" />
                <span className="text-sm truncate max-w-[150px]">{attachment.name || "Vídeo"}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border border-border">
                <FileText className="w-6 h-6 text-red-500" />
                <span className="text-sm truncate max-w-[150px]">{attachment.name || "PDF"}</span>
              </div>
            )}
            <button
              onClick={removeAttachment}
              className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/90"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-background flex-shrink-0">
        {/* Chat mode indicator */}
        {isChatMode && (
          <div className="mb-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <Lightbulb className="w-3 h-3" />
            <span>Modo Conversa ativo - As mensagens não executarão ações no projeto</span>
          </div>
        )}
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {/* Attachment button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating || step === "generating"}
            title="Anexar arquivo (imagem, PDF ou vídeo)"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={getPlaceholder()}
            disabled={isGenerating || step === "generating"}
            className="flex-1"
          />
          
          {/* Chat mode toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={isChatMode ? "default" : "outline"}
                  size="icon"
                  onClick={() => setIsChatMode(!isChatMode)}
                  disabled={isGenerating || step === "generating"}
                  className={isChatMode ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
                >
                  <Lightbulb className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{isChatMode ? "Desativar modo conversa" : "Ativar modo conversa (não executa ações)"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <Button
            type="submit"
            size="icon"
            disabled={(!input.trim() && !attachment) || isGenerating || step === "generating"}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};