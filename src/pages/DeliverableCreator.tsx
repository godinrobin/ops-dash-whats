import { useState, useRef, useEffect } from "react";
import { SystemLayout } from "@/components/layout/SystemLayout";
import { DeliverableChatPanel } from "@/components/deliverable-creator/DeliverableChatPanel";
import { DeliverablePreviewPanel } from "@/components/deliverable-creator/DeliverablePreviewPanel";
import { DeliverableTemplateSelector } from "@/components/deliverable-creator/DeliverableTemplateSelector";

export interface DeliverableConfig {
  niche: string;
  primaryColor: string;
  secondaryColor: string;
  targetAudience: string;
  includeVideos: boolean;
  videoLinks: string[];
}

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  imageUrl?: string;
};

export type ConversationStep = 
  | "template_selection"
  | "ask_niche"
  | "ask_primary_color"
  | "ask_secondary_color"
  | "ask_audience"
  | "ask_videos"
  | "ask_video_links"
  | "generating"
  | "editing";

const DeliverableCreator = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [step, setStep] = useState<ConversationStep>("template_selection");
  const [config, setConfig] = useState<DeliverableConfig>({
    niche: "",
    primaryColor: "#E91E63",
    secondaryColor: "#FCE4EC",
    targetAudience: "",
    includeVideos: false,
    videoLinks: [],
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    setStep("ask_niche");
    setMessages([
      {
        role: "assistant",
        content: "Ótima escolha! 🎉 Agora me conte: **qual é o nicho** que você quer trabalhar?\n\nExemplo: Artesanato em Resina, Confeitaria, Crochê, Maquiagem, etc.",
      },
    ]);
  };

  const handleUserMessage = async (message: string, imageUrl?: string) => {
    const userMsg: ChatMessage = { role: "user", content: message, imageUrl };
    setMessages((prev) => [...prev, userMsg]);

    switch (step) {
      case "ask_niche":
        setConfig((prev) => ({ ...prev, niche: message }));
        setStep("ask_primary_color");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Perfeito! **${message}** é um ótimo nicho! 💪\n\nAgora escolha a **cor principal** do seu app. Você pode digitar:\n- Um nome de cor (ex: rosa, azul, verde)\n- Ou um código hexadecimal (ex: #E91E63)`,
            },
          ]);
        }, 300);
        break;

      case "ask_primary_color":
        const primaryColor = parseColor(message);
        setConfig((prev) => ({ ...prev, primaryColor }));
        setStep("ask_secondary_color");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Cor principal definida! 🎨\n\nAgora escolha a **cor secundária** (geralmente uma versão mais clara ou um tom complementar).`,
            },
          ]);
        }, 300);
        break;

      case "ask_secondary_color":
        const secondaryColor = parseColor(message);
        setConfig((prev) => ({ ...prev, secondaryColor }));
        setStep("ask_audience");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Cores definidas! ✨\n\nQual é o **público-alvo** do seu entregável?\n\nExemplo: Mulheres 25-45 anos, iniciantes em artesanato`,
            },
          ]);
        }, 300);
        break;

      case "ask_audience":
        setConfig((prev) => ({ ...prev, targetAudience: message }));
        setStep("ask_videos");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Entendido! 👥\n\nVocê deseja **incluir vídeo aulas** no seu entregável?\n\nResponda **sim** ou **não**.`,
            },
          ]);
        }, 300);
        break;

      case "ask_videos":
        const wantsVideos = message.toLowerCase().includes("sim") || message.toLowerCase().includes("yes");
        setConfig((prev) => ({ ...prev, includeVideos: wantsVideos }));
        
        if (wantsVideos) {
          setStep("ask_video_links");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimo! 🎥\n\nAgora adicione os links dos vídeos. Você pode enviar:\n- Links do YouTube\n- Códigos do Vturb\n\nEnvie um link por mensagem. Quando terminar, digite **pronto** ou **gerar**.`,
              },
            ]);
          }, 300);
        } else {
          startGeneration({ ...config, includeVideos: false });
        }
        break;

      case "ask_video_links":
        if (message.toLowerCase() === "pronto" || message.toLowerCase() === "gerar") {
          startGeneration(config);
        } else {
          setConfig((prev) => ({
            ...prev,
            videoLinks: [...prev.videoLinks, message],
          }));
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Link adicionado! ✅ (${config.videoLinks.length + 1} vídeo${config.videoLinks.length > 0 ? "s" : ""})\n\nEnvie mais links ou digite **pronto** para gerar o app.`,
              },
            ]);
          }, 300);
        }
        break;

      case "editing":
        // User is making edits to the generated site
        await generateWithEdit(message);
        break;
    }
  };

  const startGeneration = async (finalConfig: DeliverableConfig) => {
    setStep("generating");
    setIsGenerating(true);
    
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `🚀 **Gerando seu app...**\n\n📋 Nicho: ${finalConfig.niche}\n🎨 Cores: ${finalConfig.primaryColor} / ${finalConfig.secondaryColor}\n👥 Público: ${finalConfig.targetAudience}\n🎥 Vídeos: ${finalConfig.includeVideos ? finalConfig.videoLinks.length + " vídeo(s)" : "Não"}\n\nAguarde enquanto crio seu entregável...`,
      },
    ]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-deliverable`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: `Gere o HTML completo do app para o nicho "${finalConfig.niche}" com as cores ${finalConfig.primaryColor} (principal) e ${finalConfig.secondaryColor} (secundária). O público-alvo é: ${finalConfig.targetAudience}. ${finalConfig.includeVideos && finalConfig.videoLinks.length > 0 ? `Inclua as seguintes vídeo aulas: ${finalConfig.videoLinks.join(", ")}` : "Não incluir vídeo aulas."}`,
              },
            ],
            config: finalConfig,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao gerar entregável");
      }

      await processStream(response);
      
      setStep("editing");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ **App gerado com sucesso!**\n\nVeja o preview à direita. Você pode:\n- Pedir modificações (ex: "mude a cor do botão", "adicione mais seções")\n- Fazer o download do ZIP quando estiver satisfeito`,
        },
      ]);
    } catch (error) {
      console.error("Generation error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Ocorreu um erro ao gerar o app. Por favor, tente novamente.`,
        },
      ]);
      setStep("editing");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateWithEdit = async (editRequest: string) => {
    setIsGenerating(true);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-deliverable`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "assistant",
                content: generatedHtml,
              },
              {
                role: "user",
                content: `Faça a seguinte modificação no código HTML atual: ${editRequest}. Retorne o HTML completo modificado.`,
              },
            ],
            config,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao modificar");
      }

      await processStream(response);
      
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ Modificação aplicada! Veja o resultado no preview.`,
        },
      ]);
    } catch (error) {
      console.error("Edit error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Erro ao aplicar modificação. Tente novamente.`,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const processStream = async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";
    let htmlContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            htmlContent += content;
            // Extract HTML from markdown code blocks if present
            const htmlMatch = htmlContent.match(/```html\n?([\s\S]*?)```/) || 
                             htmlContent.match(/```\n?([\s\S]*?)```/);
            if (htmlMatch) {
              setGeneratedHtml(htmlMatch[1]);
            } else if (htmlContent.includes("<!DOCTYPE") || htmlContent.includes("<html")) {
              setGeneratedHtml(htmlContent);
            }
          }
        } catch {
          // Incomplete JSON, continue
        }
      }
    }

    // Final extraction
    const finalMatch = htmlContent.match(/```html\n?([\s\S]*?)```/) || 
                       htmlContent.match(/```\n?([\s\S]*?)```/);
    if (finalMatch) {
      setGeneratedHtml(finalMatch[1]);
    } else if (htmlContent.includes("<!DOCTYPE") || htmlContent.includes("<html")) {
      setGeneratedHtml(htmlContent);
    }
  };

  const parseColor = (input: string): string => {
    const colorMap: Record<string, string> = {
      rosa: "#E91E63",
      pink: "#E91E63",
      azul: "#2196F3",
      blue: "#2196F3",
      verde: "#4CAF50",
      green: "#4CAF50",
      roxo: "#9C27B0",
      purple: "#9C27B0",
      laranja: "#FF9800",
      orange: "#FF9800",
      vermelho: "#F44336",
      red: "#F44336",
      amarelo: "#FFEB3B",
      yellow: "#FFEB3B",
      preto: "#212121",
      black: "#212121",
      branco: "#FFFFFF",
      white: "#FFFFFF",
      dourado: "#FFD700",
      gold: "#FFD700",
      prata: "#C0C0C0",
      silver: "#C0C0C0",
    };

    const lowerInput = input.toLowerCase().trim();
    if (colorMap[lowerInput]) {
      return colorMap[lowerInput];
    }
    if (input.startsWith("#") && (input.length === 4 || input.length === 7)) {
      return input;
    }
    return "#E91E63"; // Default
  };

  if (step === "template_selection") {
    return (
      <SystemLayout>
        <div className="container py-8 max-w-5xl mx-auto">
          <DeliverableTemplateSelector onSelect={handleTemplateSelect} />
        </div>
      </SystemLayout>
    );
  }

  return (
    <SystemLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Chat Panel - Left */}
        <div className="w-1/2 border-r border-border flex flex-col">
          <DeliverableChatPanel
            messages={messages}
            onSendMessage={handleUserMessage}
            isGenerating={isGenerating}
            step={step}
          />
        </div>

        {/* Preview Panel - Right */}
        <div className="w-1/2 flex flex-col bg-muted/30">
          <DeliverablePreviewPanel
            html={generatedHtml}
            isGenerating={isGenerating}
            config={config}
          />
        </div>
      </div>
    </SystemLayout>
  );
};

export default DeliverableCreator;
