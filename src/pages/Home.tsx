import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import Autoplay from "embla-carousel-autoplay";
import Marketplace from "./Marketplace";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { RestrictedFeatureModal } from "@/components/RestrictedFeatureModal";
import { Lock } from "lucide-react";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { GlowCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import tiktokLogo from "@/assets/tiktok-logo.png";
import automatizapIcon from "@/assets/automatizap-icon.png";
import disparazapIcon from "@/assets/disparazap-icon.png";

interface SystemCardProps {
  icon: React.ReactNode;
  title: string;
  shortTitle?: string;
  description: string;
  onClick: () => void;
  isLocked?: boolean;
  isBeta?: boolean;
  gradient?: string | null;
  glowColor?: 'blue' | 'purple' | 'green' | 'red' | 'orange';
}

const SystemCard = ({ icon, title, shortTitle, description, onClick, isLocked, isBeta, gradient, glowColor = 'purple' }: SystemCardProps) => {
  return (
    <GlowCard
      glowColor={glowColor}
      customSize
      className="h-full w-full cursor-pointer flex flex-col transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
      onClick={onClick}
    >
      {isLocked && (
        <div className="absolute top-3 right-3 z-10">
          <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
            <Lock className="w-4 h-4 text-accent" />
          </div>
        </div>
      )}
      {isBeta && (
        <div className="absolute top-2 left-2 z-10">
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-accent/20 text-accent border border-accent/30 rounded-full">
            Beta
          </span>
        </div>
      )}
      
      <div className="flex flex-col items-center text-center h-full overflow-hidden">
        {/* Icon centered at top */}
        <div className="w-12 h-12 rounded-xl border border-border/50 flex items-center justify-center bg-background/50 mb-3 md:mb-4 flex-shrink-0">
          {icon}
        </div>
        
        {/* Title and description */}
        <div className="flex-1 flex flex-col min-w-0 w-full px-1">
          <h3 className={cn(
            "text-[10px] sm:text-xs md:text-lg font-semibold tracking-tight text-foreground mb-1 md:mb-2 leading-tight",
            gradient && `bg-gradient-to-r ${gradient} bg-clip-text text-transparent`
          )}>
            {title}
          </h3>
          <p className="hidden md:block text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
        </div>
      </div>
    </GlowCard>
  );
};

interface HomeProps {
  restrictedMode?: boolean;
  restrictedFeatureName?: string;
}

const Home = ({ restrictedMode = false, restrictedFeatureName }: HomeProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFullMember, loading: accessLoading } = useAccessLevel();
  const [restrictedModalOpen, setRestrictedModalOpen] = useState(false);
  const [selectedFeatureName, setSelectedFeatureName] = useState<string>("");
  
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: true })
  );

  const [mode, setMode] = useState<"sistemas" | "marketplace" | "ads">(() => {
    const saved = localStorage.getItem("homeMode");
    if (saved === "marketplace") return "marketplace";
    if (saved === "ads") return "ads";
    return "sistemas";
  });

  useEffect(() => {
    localStorage.setItem("homeMode", mode);
  }, [mode]);

  useEffect(() => {
    if (user && mode === "sistemas") {
      supabase.from("marketplace_products").select("*").then(() => {});
      supabase.from("sms_user_wallets").select("balance").eq("user_id", user.id).maybeSingle().then(() => {});
      supabase.functions.invoke("sms-get-services").then(() => {});
      supabase.functions.invoke("smm-get-services").then(() => {});
    }
  }, [user, mode]);

  const videos = [
    { id: "81hMbGdBQd0", name: "COMO CRIAR ENTREGÁVEL COM IA" },
    { id: "dDijem3cE7Y", name: "COMO ESCALO NO WHATSAPP" },
    { id: "Eb_IMIGdXbs", name: "CRIAR WHATSAPP SEM CADASTRAR CHIP" },
    { id: "1m4UhUWcrQU", name: "MÚLTIPLOS WHATSAPP NO IPHONE" },
    { id: "FXpRT-Dsqes", name: "ORGANIZADOR DE NÚMEROS DE WHATSAPP" },
  ];

  const systems: Array<{
    path: string;
    emoji?: string;
    image?: string;
    title: string;
    shortTitle?: string;
    description: string;
    gradient: string | null;
    restricted: boolean;
    glowColor: 'blue' | 'purple' | 'green' | 'red' | 'orange';
    isBeta?: boolean;
  }> = [
    { 
      path: "/metricas", 
      emoji: "📊", 
      title: "Sistema de Métricas",
      shortTitle: "Métricas",
      description: "Gerencie suas métricas de produtos e acompanhe resultados",
      gradient: null,
      restricted: false,
      glowColor: 'blue'
    },
    { 
      path: "/organizador-numeros", 
      emoji: "📱", 
      title: "Organizador de Números",
      shortTitle: "Organizador",
      description: "Organize e gerencie seus números de trabalho",
      gradient: null,
      restricted: false,
      glowColor: 'blue'
    },
    { 
      path: "/track-ofertas", 
      emoji: "🎯", 
      title: "Track Ofertas",
      description: "Acompanhe a performance dos anúncios de seus concorrentes",
      gradient: "from-accent to-orange-400",
      restricted: false,
      glowColor: 'orange'
    },
    { 
      path: "/criador-funil", 
      emoji: "💬", 
      title: "Criador de Funil",
      shortTitle: "Funil",
      description: "Crie funis de vendas personalizados para WhatsApp",
      gradient: "from-green-400 to-green-600",
      restricted: true,
      glowColor: 'green'
    },
    { 
      path: "/gerador-criativos", 
      emoji: "🖼️", 
      title: "Gerador de Criativos em Imagem",
      shortTitle: "Criativos Imagem",
      description: "Crie imagens profissionais para anúncios com IA",
      gradient: "from-purple-400 to-pink-500",
      restricted: true,
      glowColor: 'purple'
    },
    { 
      path: "/gerador-variacoes-video", 
      emoji: "🎬", 
      title: "Gerador de Criativos em Vídeo",
      shortTitle: "Criativos Vídeo",
      description: "Crie variações de anúncios combinando vídeos",
      gradient: "from-violet-400 to-fuchsia-500",
      restricted: true,
      glowColor: 'purple'
    },
    { 
      path: "/gerador-audio", 
      emoji: "🎙️", 
      title: "Gerador de Áudio",
      shortTitle: "Áudio",
      description: "Transforme texto em áudio com vozes realistas",
      gradient: "from-red-400 to-orange-500",
      restricted: true,
      glowColor: 'red'
    },
    { 
      path: "/transcricao-audio", 
      emoji: "📝", 
      title: "Transcrição de Áudio",
      shortTitle: "Transcrição",
      description: "Converta áudios em texto automaticamente",
      gradient: "from-blue-400 to-cyan-500",
      restricted: true,
      glowColor: 'blue'
    },
    { 
      path: "/analisador-criativos", 
      emoji: "🔬", 
      title: "Analisador de Criativos",
      shortTitle: "Analisador",
      description: "Analise seus criativos com IA",
      gradient: "from-cyan-400 to-blue-500",
      restricted: true,
      glowColor: 'blue'
    },
    { 
      path: "/zap-spy",
      emoji: "🔍", 
      title: "Zap Spy",
      description: "Acesse as ofertas mais escaladas de X1",
      gradient: "from-accent to-yellow-400",
      restricted: false,
      glowColor: 'orange'
    },
    { 
      path: "/tag-whats", 
      emoji: "🏷️", 
      title: "Tag Whats",
      description: "Marque vendas do WhatsApp automaticamente",
      gradient: "from-teal-400 to-emerald-500",
      restricted: true,
      glowColor: 'green'
    },
    { 
      path: "/extensao-ads", 
      emoji: "🧩", 
      title: "Extensão Ads WhatsApp",
      shortTitle: "Extensão Ads",
      description: "Extensão para analisar anúncios no Chrome",
      gradient: "from-orange-400 to-amber-500",
      restricted: false,
      glowColor: 'orange'
    },
    { 
      path: "/video-downloader", 
      image: tiktokLogo,
      title: "Download Vídeos TikTok",
      shortTitle: "TikTok",
      description: "Baixe vídeos do TikTok sem marca d'água",
      gradient: "from-pink-500 to-cyan-400",
      restricted: false,
      glowColor: 'purple'
    },
    { 
      path: "/maturador", 
      emoji: "🔥", 
      title: "Maturador de WhatsApp",
      shortTitle: "Maturador",
      description: "Aqueça seus chips com conversas naturais entre instâncias",
      gradient: "from-green-400 to-emerald-500",
      restricted: true,
      glowColor: 'green'
    },
    { 
      path: "/save-whatsapp", 
      emoji: "💾", 
      title: "Save WhatsApp",
      shortTitle: "Save Whats",
      description: "Extensão para salvar contatos do WhatsApp",
      gradient: "from-green-400 to-green-600",
      restricted: false,
      glowColor: 'green'
    },
    { 
      path: "/inbox", 
      image: automatizapIcon,
      title: "Automati-Zap",
      description: "Sistema para automatizar as conversas do WhatsApp",
      gradient: "from-green-400 to-teal-500",
      restricted: true,
      glowColor: 'green',
      isBeta: true
    },
    { 
      path: "/disparador", 
      image: disparazapIcon, 
      title: "DisparaZap",
      description: "Envie mensagens em massa para múltiplos contatos",
      gradient: "from-blue-500 to-indigo-600",
      restricted: true,
      glowColor: 'blue'
    }
  ];

  const handleSystemClick = (system: typeof systems[0]) => {
    if (isFullMember || !system.restricted) {
      navigate(system.path);
      return;
    }
    setSelectedFeatureName(system.title);
    setRestrictedModalOpen(true);
  };

  // Don't navigate to ads in restricted mode - stay on home
  useEffect(() => {
    if (mode === "ads" && !restrictedMode) {
      navigate("/ads");
    }
  }, [mode, navigate, restrictedMode]);

  if (mode === "marketplace") {
    return <Marketplace onModeChange={setMode} currentMode={mode} />;
  }

  const renderIcon = (system: typeof systems[0]) => {
    if ('image' in system && system.image) {
      return (
        <img 
          src={system.image} 
          alt={system.title} 
          className="w-8 h-8 object-contain"
        />
      );
    }
    return <span className="text-2xl">{system.emoji}</span>;
  };

  return (
    <>
      <Header mode={mode} onModeChange={setMode} />
      <div className="h-14 md:h-16" />
      <div className={cn(
        "min-h-screen bg-background p-4 md:p-10 relative overflow-hidden",
        restrictedMode && "blur-md pointer-events-none select-none"
      )}>
        <BackgroundBeams className="z-0" />
        
        <div className="container mx-auto max-w-7xl relative z-10">
          <header className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">🎯 Bem-vindo!</h1>
            <p className="text-muted-foreground text-lg">
              Escolha o sistema que deseja acessar
            </p>
          </header>

          {/* Grid with 3 columns and equal sized cards with stagger animation */}
          <motion.div 
            className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.05,
                },
              },
            }}
          >
            {systems.map((system, index) => {
              const isLocked = !accessLoading && isFullMember === false && system.restricted;
              
              return (
                <motion.div 
                  key={system.path} 
                  className="h-40 md:h-48"
                  variants={{
                    hidden: { 
                      opacity: 0, 
                      y: 30,
                      scale: 0.95,
                    },
                    visible: { 
                      opacity: 1, 
                      y: 0,
                      scale: 1,
                      transition: {
                        type: "spring",
                        stiffness: 300,
                        damping: 24,
                      },
                    },
                  }}
                >
                  <SystemCard
                    icon={renderIcon(system)}
                    title={system.title}
                    shortTitle={system.shortTitle}
                    description={system.description}
                    onClick={() => handleSystemClick(system)}
                    isLocked={isLocked}
                    isBeta={system.isBeta}
                    gradient={system.gradient}
                    glowColor={system.glowColor}
                  />
                </motion.div>
              );
            })}
          </motion.div>

          <section className="mt-16">
            <h2 className="text-3xl font-bold text-center mb-8">Conteúdo</h2>
            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              plugins={[autoplayPlugin.current]}
              className="w-full max-w-5xl mx-auto"
            >
              <CarouselContent>
                {videos.map((video, index) => (
                  <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                    <div className="p-1 h-full">
                      <Card className="h-full flex flex-col bg-card border border-border/50">
                        <CardContent className="p-4 flex flex-col h-full">
                          <div className="aspect-video mb-3 flex-shrink-0">
                            <iframe
                              width="100%"
                              height="100%"
                              src={`https://www.youtube.com/embed/${video.id}`}
                              title={video.name}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              referrerPolicy="strict-origin-when-cross-origin"
                              allowFullScreen
                              className="rounded-lg"
                            />
                          </div>
                          <p className="text-sm font-medium text-center line-clamp-2 min-h-[2.5rem]">{video.name}</p>
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </section>

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>

      <RestrictedFeatureModal
        open={restrictedModalOpen}
        onOpenChange={setRestrictedModalOpen}
        featureName={selectedFeatureName}
      />
    </>
  );
};

export default Home;
