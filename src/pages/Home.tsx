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
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";
import tiktokLogo from "@/assets/tiktok-logo.png";
import automatizapIcon from "@/assets/automatizap-icon.png";
import disparazapIcon from "@/assets/disparazap-icon.png";

interface GridItemProps {
  area: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  isLocked?: boolean;
  gradient?: string | null;
}

const GridItem = ({ area, icon, title, description, onClick, isLocked, gradient }: GridItemProps) => {
  return (
    <li className={cn("min-h-[14rem] list-none", area)}>
      <div 
        className="relative h-full rounded-2xl border border-border/50 p-2 md:rounded-3xl md:p-3 cursor-pointer"
        onClick={onClick}
      >
        <GlowingEffect
          spread={40}
          glow={true}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
        />
        <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-0.75 p-6 bg-card/80 backdrop-blur-sm md:p-6">
          {isLocked && (
            <div className="absolute top-3 right-3 z-10">
              <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
                <Lock className="w-4 h-4 text-accent" />
              </div>
            </div>
          )}
          <div className="relative flex flex-1 flex-col justify-between gap-3">
            <div className="w-fit rounded-lg border border-border/50 p-2">
              {icon}
            </div>
            <div className="space-y-2">
              <h3 className={cn(
                "text-xl font-semibold tracking-tight text-foreground",
                gradient && `bg-gradient-to-r ${gradient} bg-clip-text text-transparent`
              )}>
                {title}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFullMember, loading: accessLoading } = useAccessLevel();
  const [restrictedModalOpen, setRestrictedModalOpen] = useState(false);
  const [selectedFeatureName, setSelectedFeatureName] = useState<string>("");
  
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: true })
  );

  const [mode, setMode] = useState<"sistemas" | "marketplace">(() => {
    const saved = localStorage.getItem("homeMode");
    return (saved === "marketplace" ? "marketplace" : "sistemas");
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

  const systems = [
    { 
      path: "/metricas", 
      emoji: "📊", 
      title: "Sistema de Métricas",
      description: "Gerencie suas métricas de produtos e acompanhe resultados",
      gradient: null,
      restricted: false
    },
    { 
      path: "/organizador-numeros", 
      emoji: "📱", 
      title: "Organizador de Números",
      description: "Organize e gerencie seus números de trabalho",
      gradient: null,
      restricted: false
    },
    { 
      path: "/track-ofertas", 
      emoji: "🎯", 
      title: "Track Ofertas",
      description: "Acompanhe a performance dos anúncios de seus concorrentes",
      gradient: "from-accent to-orange-400",
      restricted: false
    },
    { 
      path: "/criador-funil", 
      emoji: "💬", 
      title: "Criador de Funil",
      description: "Crie funis de vendas personalizados para WhatsApp",
      gradient: "from-green-400 to-green-600",
      restricted: true
    },
    { 
      path: "/gerador-criativos", 
      emoji: "🖼️", 
      title: "Gerador de Criativos em Imagem",
      description: "Crie imagens profissionais para anúncios com IA",
      gradient: "from-purple-400 to-pink-500",
      restricted: true
    },
    { 
      path: "/gerador-variacoes-video", 
      emoji: "🎬", 
      title: "Gerador de Criativos em Vídeo",
      description: "Crie variações de anúncios combinando vídeos",
      gradient: "from-violet-400 to-fuchsia-500",
      restricted: true
    },
    { 
      path: "/gerador-audio", 
      emoji: "🎙️", 
      title: "Gerador de Áudio",
      description: "Transforme texto em áudio com vozes realistas",
      gradient: "from-red-400 to-orange-500",
      restricted: true
    },
    { 
      path: "/transcricao-audio", 
      emoji: "📝", 
      title: "Transcrição de Áudio",
      description: "Converta áudios em texto automaticamente",
      gradient: "from-blue-400 to-cyan-500",
      restricted: true
    },
    { 
      path: "/analisador-criativos", 
      emoji: "🔬", 
      title: "Analisador de Criativos",
      description: "Analise seus criativos com IA",
      gradient: "from-cyan-400 to-blue-500",
      restricted: true
    },
    { 
      path: "/zap-spy",
      emoji: "🔍", 
      title: "Zap Spy",
      description: "Acesse as ofertas mais escaladas de X1",
      gradient: "from-accent to-yellow-400",
      restricted: false
    },
    { 
      path: "/tag-whats", 
      emoji: "🏷️", 
      title: "Tag Whats",
      description: "Marque vendas do WhatsApp automaticamente",
      gradient: "from-teal-400 to-emerald-500",
      restricted: true
    },
    { 
      path: "/extensao-ads", 
      emoji: "🧩", 
      title: "Extensão Ads WhatsApp",
      description: "Extensão para analisar anúncios no Chrome",
      gradient: "from-orange-400 to-amber-500",
      restricted: false
    },
    { 
      path: "/video-downloader", 
      image: tiktokLogo,
      title: "Download Vídeos TikTok",
      description: "Baixe vídeos do TikTok sem marca d'água",
      gradient: "from-pink-500 to-cyan-400",
      restricted: false
    },
    { 
      path: "/maturador", 
      emoji: "🔥", 
      title: "Maturador de WhatsApp",
      description: "Aqueça seus chips com conversas naturais entre instâncias",
      gradient: "from-green-400 to-emerald-500",
      restricted: true
    },
    { 
      path: "/save-whatsapp", 
      emoji: "💾", 
      title: "Save WhatsApp",
      description: "Extensão para salvar contatos do WhatsApp",
      gradient: "from-green-400 to-green-600",
      restricted: false
    },
    { 
      path: "/inbox", 
      image: automatizapIcon,
      title: "Automati-Zap",
      description: "Sistema para automatizar as conversas do WhatsApp",
      gradient: "from-green-400 to-teal-500",
      restricted: true
    },
    { 
      path: "/disparador", 
      image: disparazapIcon, 
      title: "DisparaZap",
      description: "Envie mensagens em massa para múltiplos contatos",
      gradient: "from-blue-500 to-indigo-600",
      restricted: true
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
    return <span className="text-2xl">{(system as any).emoji}</span>;
  };

  return (
    <>
      <Header mode={mode} onModeChange={setMode} />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-10">
        <div className="container mx-auto max-w-7xl">
          <header className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">🎯 Bem-vindo!</h1>
            <p className="text-muted-foreground text-lg">
              Escolha o sistema que deseja acessar
            </p>
          </header>

          <ul className="grid grid-cols-1 grid-rows-none gap-4 md:grid-cols-12 md:grid-rows-6 lg:gap-4 xl:max-h-[50rem] xl:grid-rows-4">
            {systems.map((system, index) => {
              const isLocked = !accessLoading && isFullMember === false && system.restricted;
              
              // Define grid areas for variety
              const areas = [
                "md:[grid-area:1/1/2/5]",    // Row 1, spans 4 cols
                "md:[grid-area:1/5/2/9]",    // Row 1, spans 4 cols
                "md:[grid-area:1/9/3/13]",   // Row 1-2, spans 4 cols (tall)
                "md:[grid-area:2/1/3/5]",    // Row 2, spans 4 cols
                "md:[grid-area:2/5/3/9]",    // Row 2, spans 4 cols
                "md:[grid-area:3/1/4/7]",    // Row 3, spans 6 cols (wide)
                "md:[grid-area:3/7/4/13]",   // Row 3, spans 6 cols (wide)
                "md:[grid-area:4/1/5/5]",    // Row 4, spans 4 cols
                "md:[grid-area:4/5/5/9]",    // Row 4, spans 4 cols
                "md:[grid-area:4/9/5/13]",   // Row 4, spans 4 cols
                "md:[grid-area:5/1/6/5]",    // Row 5, spans 4 cols
                "md:[grid-area:5/5/6/9]",    // Row 5, spans 4 cols
                "md:[grid-area:5/9/6/13]",   // Row 5, spans 4 cols
                "md:[grid-area:6/1/7/7]",    // Row 6, spans 6 cols (wide)
                "md:[grid-area:6/7/7/13]",   // Row 6, spans 6 cols (wide)
                "md:[grid-area:7/1/8/5]",    // Row 7, spans 4 cols
                "md:[grid-area:7/5/8/9]",    // Row 7, spans 4 cols
              ];
              
              return (
                <GridItem
                  key={system.path}
                  area={areas[index % areas.length]}
                  icon={renderIcon(system)}
                  title={system.title}
                  description={system.description}
                  onClick={() => handleSystemClick(system)}
                  isLocked={isLocked}
                  gradient={system.gradient}
                />
              );
            })}
          </ul>

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
