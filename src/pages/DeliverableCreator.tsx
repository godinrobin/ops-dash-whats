import { useState, useEffect } from "react";
import { SystemLayout } from "@/components/layout/SystemLayout";
import { DeliverableChatPanel } from "@/components/deliverable-creator/DeliverableChatPanel";
import { DeliverablePreviewPanel } from "@/components/deliverable-creator/DeliverablePreviewPanel";
import { DeliverableTemplateSelector } from "@/components/deliverable-creator/DeliverableTemplateSelector";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlowingCard } from "@/components/ui/glowing-card";
import { Trash2, Eye, Plus, FileCode, Calendar, Pencil, Check, X, ArrowLeft, Zap } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { useDeliverablePromptLimit } from "@/hooks/useDeliverablePromptLimit";
import { Progress } from "@/components/ui/progress";

export interface DeliverableConfig {
  templateId: string;
  niche: string;
  primaryColor: string;
  secondaryColor: string;
  targetAudience: string;
  productDetails: string;
  includeVideos: boolean;
  videoLinks: string[];
  numberOfLessons?: number;
  includePdfSection?: boolean;
  // PIX configuration
  includePix?: boolean;
  pixName?: string;
  pixKey?: string;
  pixBank?: string;
  // Additional observations
  additionalObservations?: string;
  // Devotional specific
  includeContributionSection?: boolean;
  // Protected app specific
  includeCountdown?: boolean;
  countdownMinutes?: number;
  includePasswordProtection?: boolean;
  accessPassword?: string;
  menuTabs?: string[];
  // PDF Library specific
  includeMarquee?: boolean;
  marqueeText?: string;
  numberOfPdfs?: number;
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
  | "ask_product_details"
  | "ask_videos"
  | "ask_video_links"
  | "ask_num_lessons"
  | "ask_pdf_section"
  | "ask_pix"
  | "ask_pix_name"
  | "ask_pix_key"
  | "ask_pix_bank"
  | "ask_observations"
  | "generating"
  | "editing"
  // Devotional specific
  | "ask_num_devotionals"
  | "ask_contribution_section"
  // Protected app specific
  | "ask_countdown"
  | "ask_countdown_time"
  | "ask_password"
  | "ask_password_value"
  | "ask_menu_tabs"
  // PDF Library specific
  | "ask_marquee"
  | "ask_marquee_text"
  | "ask_num_pdfs";

interface SavedDeliverable {
  id: string;
  name: string;
  template_id: string;
  config: DeliverableConfig;
  html_content: string;
  created_at: string;
  updated_at: string;
}

const DeliverableCreator = () => {
  const { user } = useAuth();
  const { 
    promptsUsed, 
    remainingPrompts, 
    dailyLimit, 
    hasReachedLimit, 
    incrementPrompt 
  } = useDeliverablePromptLimit(user?.id);
  
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [step, setStep] = useState<ConversationStep>("template_selection");
  const [config, setConfig] = useState<DeliverableConfig>({
    templateId: "",
    niche: "",
    primaryColor: "#E91E63",
    secondaryColor: "#FCE4EC",
    targetAudience: "",
    productDetails: "",
    includeVideos: false,
    videoLinks: [],
    numberOfLessons: undefined,
    includePdfSection: false,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedDeliverables, setSavedDeliverables] = useState<SavedDeliverable[]>([]);
  const [currentDeliverableId, setCurrentDeliverableId] = useState<string | null>(null);
  const [showSavedList, setShowSavedList] = useState(true);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // Fetch saved deliverables on mount
  useEffect(() => {
    if (user) {
      fetchSavedDeliverables();
    }
  }, [user]);

  const fetchSavedDeliverables = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from("saved_deliverables")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching deliverables:", error);
      return;
    }
    
    // Map the data to our local type
    const mappedData: SavedDeliverable[] = (data || []).map((item) => ({
      id: item.id,
      name: item.name,
      template_id: item.template_id,
      config: item.config as unknown as DeliverableConfig,
      html_content: item.html_content,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
    
    setSavedDeliverables(mappedData);
  };

  const saveDeliverable = async (html: string) => {
    if (!user || !html) return;
    
    const deliverableName = config.niche ? `Entregável - ${config.niche}` : `Entregável ${new Date().toLocaleDateString("pt-BR")}`;
    
    if (currentDeliverableId) {
      // Update existing
      const { error } = await supabase
        .from("saved_deliverables")
        .update({
          config: JSON.parse(JSON.stringify(config)),
          html_content: html,
          name: deliverableName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentDeliverableId);
      
      if (error) {
        console.error("Error updating deliverable:", error);
        return;
      }
    } else {
      // Create new
      const { data, error } = await supabase
        .from("saved_deliverables")
        .insert({
          user_id: user.id,
          name: deliverableName,
          template_id: selectedTemplate || "app-course",
          config: JSON.parse(JSON.stringify(config)),
          html_content: html,
        })
        .select()
        .single();
      
      if (error) {
        console.error("Error saving deliverable:", error);
        return;
      }
      
      setCurrentDeliverableId(data.id);
    }
    
    await fetchSavedDeliverables();
  };

  const deleteDeliverable = async (id: string) => {
    const { error } = await supabase
      .from("saved_deliverables")
      .delete()
      .eq("id", id);
    
    if (error) {
      toast.error("Erro ao deletar entregável");
      return;
    }
    
    toast.success("Entregável deletado");
    await fetchSavedDeliverables();
    
    if (currentDeliverableId === id) {
      resetToNewDeliverable();
    }
  };

  const updateDeliverableName = async (id: string, newName: string) => {
    if (!newName.trim()) {
      toast.error("Nome não pode estar vazio");
      return;
    }

    const { error } = await supabase
      .from("saved_deliverables")
      .update({ name: newName.trim() })
      .eq("id", id);
    
    if (error) {
      toast.error("Erro ao atualizar nome");
      return;
    }
    
    toast.success("Nome atualizado");
    setEditingNameId(null);
    await fetchSavedDeliverables();
  };

  const startEditingName = (deliverable: SavedDeliverable) => {
    setEditingNameId(deliverable.id);
    setEditingNameValue(deliverable.name);
  };

  const cancelEditingName = () => {
    setEditingNameId(null);
    setEditingNameValue("");
  };

  const loadDeliverable = (deliverable: SavedDeliverable) => {
    setCurrentDeliverableId(deliverable.id);
    setSelectedTemplate(deliverable.template_id);
    setConfig(deliverable.config);
    setGeneratedHtml(deliverable.html_content);
    setStep("editing");
    setShowSavedList(false);
    setMessages([
      {
        role: "assistant",
        content: `✅ Entregável "${deliverable.name}" carregado!\n\nVocê pode continuar editando. Digite o que deseja modificar.`,
      },
    ]);
  };

  const resetToNewDeliverable = () => {
    setCurrentDeliverableId(null);
    setSelectedTemplate(null);
    setStep("template_selection");
    setConfig({
      templateId: "",
      niche: "",
      primaryColor: "#E91E63",
      secondaryColor: "#FCE4EC",
      targetAudience: "",
      productDetails: "",
      includeVideos: false,
      videoLinks: [],
      numberOfLessons: undefined,
      includePdfSection: false,
      includePix: false,
      pixName: undefined,
      pixKey: undefined,
      pixBank: undefined,
      additionalObservations: undefined,
    });
    setMessages([]);
    setGeneratedHtml("");
    setShowSavedList(true);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    setConfig(prev => ({ ...prev, templateId }));
    setStep("ask_niche");
    setShowSavedList(false);
    
    let templateMessage = "Ótima escolha! 🎉 Agora me conte: **qual é o nicho** que você quer trabalhar?\n\nExemplo: Artesanato em Resina, Confeitaria, Crochê, Maquiagem, etc.";
    
    if (templateId === "video-course") {
      templateMessage = "Ótima escolha! 🎥 Vamos criar um site com grid de video aulas.\n\nMe conte: **qual é o nicho** do seu curso?\n\nExemplo: Crochê para Bebês, Confeitaria, Maquiagem, etc.";
    } else if (templateId === "devotional-app") {
      templateMessage = "Ótima escolha! 📖✨ Vamos criar um app devocional.\n\nMe conte: **qual é o tema** do seu devocional?\n\nExemplo: Salmos, Provérbios, Mulheres da Bíblia, 30 Dias de Fé, etc.";
    } else if (templateId === "protected-app") {
      templateMessage = "Ótima escolha! 🔐 Vamos criar um app com acesso protegido.\n\nMe conte: **qual é o nicho/tema** do seu conteúdo?\n\nExemplo: Bolos Caseiros, Maquiagem, Curso de Inglês, Receitas Fitness, etc.";
    } else if (templateId === "pdf-library") {
      templateMessage = "Ótima escolha! 📚 Vamos criar uma biblioteca de PDFs elegante.\n\nMe conte: **qual é o tema/nicho** da sua biblioteca?\n\nExemplo: Receitas de Confeitaria, Marketing Digital, Devocionais, Artesanato, etc.";
    }
    
    setMessages([
      {
        role: "assistant",
        content: templateMessage,
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
              content: `Perfeito! **${message}** é um ótimo nicho! 💪\n\nAgora escolha a **cor principal** do seu site. Você pode digitar:\n- Um nome de cor (ex: rosa, azul, verde)\n- Ou um código hexadecimal (ex: #E91E63)`,
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
        setStep("ask_product_details");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Perfeito! 👥\n\nAgora me conte mais sobre o seu **produto/curso**:\n\n- O que ele ensina?\n- Quais os principais benefícios?\n- Qual o diferencial?\n\nQuanto mais detalhes, melhor será o site gerado!`,
            },
          ]);
        }, 300);
        break;

      case "ask_product_details":
        setConfig((prev) => ({ ...prev, productDetails: message }));
        
        // For video-course template, ask about number of lessons first
        if (selectedTemplate === "video-course") {
          setStep("ask_num_lessons");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimas informações! 📝\n\n**Quantas aulas** terá seu curso?\n\nDigite um número (ex: 10, 15, 30)`,
              },
            ]);
          }, 300);
        } else if (selectedTemplate === "devotional-app") {
          // Devotional app flow
          setStep("ask_num_devotionals");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimas informações! 📝\n\n**Quantos devocionais/dias** terá seu app?\n\nDigite um número (ex: 30, 60, 90)`,
              },
            ]);
          }, 300);
        } else if (selectedTemplate === "protected-app") {
          // Protected app flow - ask about countdown
          setStep("ask_countdown");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimas informações! 📝\n\n⏱️ Você deseja adicionar uma **contagem regressiva** antes do conteúdo?\n\nIsso cria urgência e exclusividade!\n\nResponda **sim** ou **não**.`,
              },
            ]);
          }, 300);
        } else if (selectedTemplate === "pdf-library") {
          // PDF Library flow - ask about number of PDFs
          setStep("ask_num_pdfs");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimas informações! 📝\n\n📚 **Quantos materiais/PDFs** sua biblioteca terá?\n\nDigite um número (ex: 6, 12, 20)`,
              },
            ]);
          }, 300);
        } else {
          setStep("ask_videos");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimas informações! 📝\n\nVocê deseja **incluir vídeo aulas** no seu entregável?\n\nResponda **sim** ou **não**.`,
              },
            ]);
          }, 300);
        }
        break;

      case "ask_num_devotionals":
        const numDevotionals = parseInt(message) || 30;
        setConfig((prev) => ({ ...prev, numberOfLessons: numDevotionals }));
        setStep("ask_pdf_section");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Perfeito! **${numDevotionals} devocionais** 📖\n\nVocê deseja incluir uma **seção de materiais PDF** (estudos, guias de oração, etc.)?\n\nResponda **sim** ou **não**.`,
            },
          ]);
        }, 300);
        break;

      case "ask_contribution_section":
        const wantsContribution = message.toLowerCase().includes("sim") || message.toLowerCase().includes("yes");
        setConfig((prev) => ({ ...prev, includeContributionSection: wantsContribution }));
        // Move to PIX question
        setStep("ask_pix");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `${wantsContribution ? "Perfeito, vou incluir seção de contribuição! 🙏" : "Ok, sem seção de contribuição."}\n\n💳 Você deseja **adicionar sua chave PIX** no final do site?\n\nIsso permite que seus apoiadores copiem sua chave facilmente.\n\nResponda **sim** ou **não**.`,
            },
          ]);
        }, 300);
        break;

      // Protected app specific steps
      case "ask_countdown":
        const wantsCountdown = message.toLowerCase().includes("sim") || message.toLowerCase().includes("yes");
        setConfig((prev) => ({ ...prev, includeCountdown: wantsCountdown }));
        
        if (wantsCountdown) {
          setStep("ask_countdown_time");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimo! ⏱️\n\n**Quantos minutos** de contagem regressiva?\n\nDigite um número (ex: 1, 3, 5, 10)`,
              },
            ]);
          }, 300);
        } else {
          // Skip to password question
          setStep("ask_password");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ok, sem countdown! ⏭️\n\n🔐 Você deseja **proteger o conteúdo com uma senha**?\n\nIsso cria exclusividade para seus clientes.\n\nResponda **sim** ou **não**.`,
              },
            ]);
          }, 300);
        }
        break;

      case "ask_countdown_time":
        const countdownMinutes = parseInt(message) || 3;
        setConfig((prev) => ({ ...prev, countdownMinutes }));
        setStep("ask_password");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Countdown configurado: **${countdownMinutes} minutos** ⏱️\n\n🔐 Você deseja **proteger o conteúdo com uma senha**?\n\nIsso cria exclusividade para seus clientes.\n\nResponda **sim** ou **não**.`,
            },
          ]);
        }, 300);
        break;

      case "ask_password":
        const wantsPassword = message.toLowerCase().includes("sim") || message.toLowerCase().includes("yes");
        setConfig((prev) => ({ ...prev, includePasswordProtection: wantsPassword }));
        
        if (wantsPassword) {
          setStep("ask_password_value");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Perfeito! 🔑\n\nQual será a **senha de acesso**?\n\nExemplo: curso2024, vip123, exclusivo`,
              },
            ]);
          }, 300);
        } else {
          // Skip to menu tabs
          setStep("ask_menu_tabs");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ok, sem proteção por senha! 🔓\n\n📱 Quais **abas** você quer no menu inferior do app?\n\nDigite separado por vírgula.\n\nExemplo: **Início, Receitas, Materiais, Sobre**`,
              },
            ]);
          }, 300);
        }
        break;

      case "ask_password_value":
        setConfig((prev) => ({ ...prev, accessPassword: message }));
        setStep("ask_menu_tabs");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Senha configurada: **${message}** 🔐\n\n📱 Quais **abas** você quer no menu inferior do app?\n\nDigite separado por vírgula.\n\nExemplo: **Início, Receitas, Materiais, Sobre**`,
            },
          ]);
        }, 300);
        break;

      case "ask_menu_tabs":
        const tabs = message.split(",").map(tab => tab.trim()).filter(tab => tab.length > 0);
        setConfig((prev) => ({ ...prev, menuTabs: tabs.length > 0 ? tabs : ["Início", "Conteúdo", "Materiais", "Config"] }));
        // Go to PIX question
        setStep("ask_pix");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Abas configuradas: **${tabs.join(", ")}** 📱\n\n💳 Você deseja **adicionar sua chave PIX** no final do site?\n\nIsso permite que seus clientes copiem sua chave facilmente.\n\nResponda **sim** ou **não**.`,
          },
        ]);
      }, 300);
      break;

      // PDF Library specific steps
      case "ask_num_pdfs":
        const numPdfs = parseInt(message) || 12;
        setConfig((prev) => ({ ...prev, numberOfPdfs: numPdfs }));
        setStep("ask_marquee");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Perfeito! **${numPdfs} materiais** 📚\n\n✨ Você deseja adicionar uma **barra animada (marquee)** com texto rolando?\n\nIsso destaca uma frase ou chamada no topo do site.\n\nResponda **sim** ou **não**.`,
            },
          ]);
        }, 300);
        break;

      case "ask_marquee":
        const wantsMarquee = message.toLowerCase().includes("sim") || message.toLowerCase().includes("yes");
        setConfig((prev) => ({ ...prev, includeMarquee: wantsMarquee }));
        
        if (wantsMarquee) {
          setStep("ask_marquee_text");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimo! 📢\n\nQual **texto** deve aparecer na barra animada?\n\nExemplo: "As melhores receitas • Conteúdo exclusivo •" ou "Materiais premium • Acesso vitalício •"`,
              },
            ]);
          }, 300);
        } else {
          // Go to PIX question
          setStep("ask_pix");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ok, sem marquee! ⏭️\n\n💳 Você deseja **adicionar sua chave PIX** no final do site?\n\nResponda **sim** ou **não**.`,
              },
            ]);
          }, 300);
        }
        break;

      case "ask_marquee_text":
        setConfig((prev) => ({ ...prev, marqueeText: message }));
        // Go to PIX question
        setStep("ask_pix");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Texto configurado: **"${message}"** 📢\n\n💳 Você deseja **adicionar sua chave PIX** no final do site?\n\nResponda **sim** ou **não**.`,
            },
          ]);
        }, 300);
        break;

        const numLessons = parseInt(message) || 10;
        setConfig((prev) => ({ ...prev, numberOfLessons: numLessons, includeVideos: true }));
        setStep("ask_video_links");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Perfeito! **${numLessons} aulas** 🎬\n\nAgora adicione os links dos vídeos para cada aula. Você pode enviar:\n- Links do YouTube\n- Códigos do Vturb\n\nEnvie um link por mensagem. Quando terminar, digite **pronto** ou **gerar**.`,
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
          // Go to PIX question instead of generating
          setStep("ask_pix");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ok, sem vídeos! 📝\n\n💳 Você deseja **adicionar sua chave PIX** no final do site?\n\nIsso permite que seus clientes copiem sua chave facilmente, aumentando a conversão.\n\nResponda **sim** ou **não**.`,
              },
            ]);
          }, 300);
        }
        break;

      case "ask_video_links":
        if (message.toLowerCase() === "pronto" || message.toLowerCase() === "gerar") {
          // For video-course template, ask about PDF section
          if (selectedTemplate === "video-course") {
            setStep("ask_pdf_section");
            setTimeout(() => {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `Links adicionados! ✅\n\nVocê deseja incluir uma **seção de materiais PDF** (apostilas, ebooks, etc.)?\n\nResponda **sim** ou **não**.`,
                },
              ]);
            }, 300);
          } else {
            // Go to PIX question
            setStep("ask_pix");
            setTimeout(() => {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `Links adicionados! ✅\n\n💳 Você deseja **adicionar sua chave PIX** no final do site?\n\nIsso permite que seus clientes copiem sua chave facilmente, aumentando a conversão.\n\nResponda **sim** ou **não**.`,
                },
              ]);
            }, 300);
          }
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
                content: `Link adicionado! ✅ (${config.videoLinks.length + 1} vídeo${config.videoLinks.length > 0 ? "s" : ""})\n\nEnvie mais links ou digite **pronto** para continuar.`,
              },
            ]);
          }, 300);
        }
        break;

      case "ask_pdf_section":
        const wantsPdf = message.toLowerCase().includes("sim") || message.toLowerCase().includes("yes");
        setConfig((prev) => ({ ...prev, includePdfSection: wantsPdf }));
        
        // For devotional app, ask about contribution section
        if (selectedTemplate === "devotional-app") {
          setStep("ask_contribution_section");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `${wantsPdf ? "Perfeito, vou incluir seção de materiais! 📄" : "Ok, sem materiais PDF."}\n\n🙏 Você deseja incluir uma **seção de contribuição/doação** no app?\n\nIsso permite que as pessoas apoiem o ministério.\n\nResponda **sim** ou **não**.`,
              },
            ]);
          }, 300);
        } else {
          // Move to PIX question
          setStep("ask_pix");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `${wantsPdf ? "Perfeito, vou incluir seção de materiais! 📄" : "Ok, sem materiais PDF."}\n\n💳 Você deseja **adicionar sua chave PIX** no final do site?\n\nIsso permite que seus clientes copiem sua chave facilmente, aumentando a conversão.\n\nResponda **sim** ou **não**.`,
              },
            ]);
          }, 300);
        }
        break;

      case "ask_pix":
        const wantsPix = message.toLowerCase().includes("sim") || message.toLowerCase().includes("yes");
        setConfig((prev) => ({ ...prev, includePix: wantsPix }));
        
        if (wantsPix) {
          setStep("ask_pix_name");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ótimo! 🏦\n\nQual é o **nome que aparece no banco** quando fazem um PIX pra você?\n\nExemplo: Maria Silva, João Santos`,
              },
            ]);
          }, 300);
        } else {
          // Skip to observations
          setStep("ask_observations");
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Ok, sem PIX! 👍\n\n📝 Alguma **observação adicional** que eu deva levar em consideração para criar o site?\n\nPode ser estilo, funcionalidades específicas, textos que devem aparecer, etc.\n\nSe não tiver, digite **não** ou **gerar**.`,
              },
            ]);
          }, 300);
        }
        break;

      case "ask_pix_name":
        setConfig((prev) => ({ ...prev, pixName: message }));
        setStep("ask_pix_key");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Nome registrado: **${message}** ✅\n\nAgora, qual é a sua **chave PIX**?\n\nPode ser CPF, email, telefone ou chave aleatória.`,
            },
          ]);
        }, 300);
        break;

      case "ask_pix_key":
        setConfig((prev) => ({ ...prev, pixKey: message }));
        setStep("ask_pix_bank");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Chave registrada! 🔑\n\nQual é o **banco** dessa chave PIX?\n\nExemplo: Nubank, Inter, Itaú, Bradesco, etc.`,
            },
          ]);
        }, 300);
        break;

      case "ask_pix_bank":
        setConfig((prev) => ({ ...prev, pixBank: message }));
        setStep("ask_observations");
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `PIX configurado: **${message}** 🏦\n\n📝 Alguma **observação adicional** que eu deva levar em consideração para criar o site?\n\nPode ser estilo, funcionalidades específicas, textos que devem aparecer, etc.\n\nSe não tiver, digite **não** ou **gerar**.`,
            },
          ]);
        }, 300);
        break;

      case "ask_observations":
        const hasObservations = !["não", "nao", "no", "gerar", "nenhuma", "nenhum"].includes(message.toLowerCase().trim());
        if (hasObservations) {
          setConfig((prev) => ({ ...prev, additionalObservations: message }));
        }
        startGeneration({ ...config, additionalObservations: hasObservations ? message : undefined });
        break;

      case "editing":
        // User is making edits to the generated site
        await generateWithEdit(message);
        break;
    }
  };

  const startGeneration = async (finalConfig: DeliverableConfig) => {
    // First generation is free - no prompt counting
    setStep("generating");
    setIsGenerating(true);
    
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `🚀 **Gerando seu site...**\n\n📋 Nicho: ${finalConfig.niche}\n🎨 Cores: ${finalConfig.primaryColor} / ${finalConfig.secondaryColor}\n👥 Público: ${finalConfig.targetAudience}\n🎥 Vídeos: ${finalConfig.includeVideos ? finalConfig.videoLinks.length + " vídeo(s)" : "Não"}\n\nAguarde enquanto crio seu entregável...`,
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
                content: `Gere o HTML completo do site para o nicho "${finalConfig.niche}" com as cores ${finalConfig.primaryColor} (principal) e ${finalConfig.secondaryColor} (secundária). O público-alvo é: ${finalConfig.targetAudience}. 

Detalhes do produto/curso: ${finalConfig.productDetails || "Não informado"}

${finalConfig.includeVideos && finalConfig.videoLinks.length > 0 ? `Inclua as seguintes vídeo aulas: ${finalConfig.videoLinks.join(", ")}` : "Não incluir vídeo aulas."}`,
              },
            ],
            config: finalConfig,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao gerar entregável");
      }

      const html = await processStream(response);
      
      // Auto-save after generation
      if (html) {
        await saveDeliverable(html);
        toast.success("Entregável salvo automaticamente!");
      }
      
      setStep("editing");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ **Site gerado e salvo com sucesso!**\n\nVeja o preview à direita. Você pode:\n- Pedir modificações (ex: "mude a cor do botão", "adicione mais seções")\n- Fazer o download do ZIP quando estiver satisfeito`,
        },
      ]);
    } catch (error) {
      console.error("Generation error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Ocorreu um erro ao gerar o site. Por favor, tente novamente.`,
        },
      ]);
      setStep("editing");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateWithEdit = async (editRequest: string) => {
    // Check prompt limit before editing
    if (hasReachedLimit) {
      toast.error("Você atingiu o limite diário de 30 prompts. Tente novamente amanhã!");
      return;
    }
    
    const canProceed = await incrementPrompt();
    if (!canProceed) {
      toast.error("Limite de prompts atingido para hoje!");
      return;
    }
    
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

      const html = await processStream(response);
      
      // Auto-save after edit
      if (html) {
        await saveDeliverable(html);
      }
      
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ Modificação aplicada e salva! Veja o resultado no preview.`,
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

  const processStream = async (response: Response): Promise<string> => {
    const reader = response.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let buffer = "";
    let htmlContent = "";
    let finalHtml = "";

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
              finalHtml = htmlMatch[1];
              setGeneratedHtml(htmlMatch[1]);
            } else if (htmlContent.includes("<!DOCTYPE") || htmlContent.includes("<html")) {
              finalHtml = htmlContent;
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
      finalHtml = finalMatch[1];
      setGeneratedHtml(finalMatch[1]);
    } else if (htmlContent.includes("<!DOCTYPE") || htmlContent.includes("<html")) {
      finalHtml = htmlContent;
      setGeneratedHtml(htmlContent);
    }

    return finalHtml;
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
        <div className="container py-8 max-w-6xl mx-auto">
          <DeliverableTemplateSelector onSelect={handleTemplateSelect} />
          
          {/* Saved Deliverables Section */}
          {savedDeliverables.length > 0 && showSavedList && (
            <div className="mt-12">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-accent" />
                  Seus Entregáveis Salvos
                </h3>
                <Badge variant="outline">{savedDeliverables.length} salvos</Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {savedDeliverables.map((deliverable, index) => (
                    <motion.div
                      key={deliverable.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <GlowingCard>
                        <Card className="border-0 bg-transparent">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center justify-between gap-2">
                              {editingNameId === deliverable.id ? (
                                <div className="flex items-center gap-1 flex-1">
                                  <Input
                                    value={editingNameValue}
                                    onChange={(e) => setEditingNameValue(e.target.value)}
                                    className="h-7 text-sm"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        updateDeliverableName(deliverable.id, editingNameValue);
                                      } else if (e.key === "Escape") {
                                        cancelEditingName();
                                      }
                                    }}
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-green-500 hover:text-green-600"
                                    onClick={() => updateDeliverableName(deliverable.id, editingNameValue)}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-muted-foreground"
                                    onClick={cancelEditingName}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <span className="truncate flex-1">{deliverable.name}</span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => startEditingName(deliverable)}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                            </CardTitle>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(deliverable.updated_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                            </div>
                          </CardHeader>
                          <CardContent className="pt-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                              <span className="truncate">Nicho: {deliverable.config.niche || "Não definido"}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="flex-1"
                                onClick={() => loadDeliverable(deliverable)}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                Abrir
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deleteDeliverable(deliverable.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </GlowingCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </SystemLayout>
    );
  }

  return (
    <SystemLayout>
      <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
        {/* Chat Panel - Left */}
        <div className="w-1/2 border-r border-border flex flex-col min-h-0">
          <div className="p-2 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={resetToNewDeliverable}
                className="text-muted-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={resetToNewDeliverable}
                className="text-muted-foreground"
              >
                <Plus className="w-4 h-4 mr-1" />
                Novo
              </Button>
            </div>
            
            {/* Prompt Counter */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${hasReachedLimit ? 'text-destructive' : 'text-accent'}`} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    {promptsUsed}/{dailyLimit} prompts
                  </span>
                  <Progress 
                    value={(promptsUsed / dailyLimit) * 100} 
                    className="h-1.5 w-20"
                  />
                </div>
              </div>
              
              {currentDeliverableId && (
                <Badge variant="outline" className="text-xs">
                  Salvo
                </Badge>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <DeliverableChatPanel
              messages={messages}
              onSendMessage={handleUserMessage}
              isGenerating={isGenerating}
              step={step}
            />
          </div>
        </div>

        {/* Preview Panel - Right */}
        <div className="w-1/2 flex flex-col min-h-0 bg-muted/30">
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
