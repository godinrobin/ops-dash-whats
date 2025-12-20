import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import Marketplace from "./Marketplace";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { RestrictedFeatureModal } from "@/components/RestrictedFeatureModal";
import { Lock } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFullMember, canAccessSystem, loading: accessLoading } = useAccessLevel();
  const [restrictedModalOpen, setRestrictedModalOpen] = useState(false);
  const [selectedFeatureName, setSelectedFeatureName] = useState<string>("");
  
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: true })
  );

  // Load mode from localStorage or default to "sistemas"
  const [mode, setMode] = useState<"sistemas" | "marketplace">(() => {
    const saved = localStorage.getItem("homeMode");
    return (saved === "marketplace" ? "marketplace" : "sistemas");
  });

  // Save mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("homeMode", mode);
  }, [mode]);

  // Pre-load marketplace data in background when user is on sistemas mode
  useEffect(() => {
    if (user && mode === "sistemas") {
      // Pre-load marketplace products
      supabase.from("marketplace_products").select("*").then(() => {});
      // Pre-load wallet balance
      supabase.from("sms_user_wallets").select("balance").eq("user_id", user.id).maybeSingle().then(() => {});
      // Pre-load SMSBot services
      supabase.functions.invoke("sms-get-services").then(() => {});
      // Pre-load SMM services
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

  // System definitions with access control
  const systems = [
    { 
      path: "/metricas", 
      emoji: "📊", 
      title: "Sistema de Métricas",
      description: "Gerencie suas métricas de produtos e acompanhe resultados",
      subtext: "Acompanhe investimentos, leads, conversões e ROAS",
      gradient: null,
      restricted: false
    },
    { 
      path: "/organizador-numeros", 
      emoji: "📱", 
      title: "Organizador de Números",
      description: "Organize e gerencie seus números de trabalho",
      subtext: "Mantenha controle de números, status e operações",
      gradient: null,
      restricted: false
    },
    { 
      path: "/track-ofertas", 
      emoji: "🎯", 
      title: "Track Ofertas",
      description: "Acompanhe a performance dos anúncios de seus concorrentes",
      subtext: "Monitore anúncios ativos e tendências diariamente",
      gradient: "from-accent to-orange-400",
      restricted: false
    },
    { 
      path: "/criador-funil", 
      emoji: "💬", 
      title: "Criador de Funil",
      description: "Crie funis de vendas personalizados para WhatsApp",
      subtext: "Gere scripts de vendas completos com IA",
      gradient: "from-green-400 to-green-600",
      restricted: true
    },
    { 
      path: "/gerador-criativos", 
      emoji: "🖼️", 
      title: "Gerador de Criativos em Imagem",
      description: "Crie imagens profissionais para anúncios com IA",
      subtext: "Gere criativos de alta qualidade automaticamente",
      gradient: "from-purple-400 to-pink-500",
      restricted: true
    },
    { 
      path: "/gerador-variacoes-video", 
      emoji: "🎬", 
      title: "Gerador de Criativos em Vídeo",
      description: "Crie variações de anúncios combinando vídeos",
      subtext: "Combine hooks, corpos e CTAs automaticamente",
      gradient: "from-violet-400 to-fuchsia-500",
      restricted: true
    },
    { 
      path: "/gerador-audio", 
      emoji: "🎙️", 
      title: "Gerador de Áudio",
      description: "Transforme texto em áudio com vozes realistas",
      subtext: "Gere áudios profissionais com IA",
      gradient: "from-red-400 to-orange-500",
      restricted: true
    },
    { 
      path: "/transcricao-audio", 
      emoji: "📝", 
      title: "Transcrição de Áudio",
      description: "Converta áudios em texto automaticamente",
      subtext: "Transcreva áudios MP3, OGG e OPUS",
      gradient: "from-blue-400 to-cyan-500",
      restricted: true
    },
    { 
      path: "/analisador-criativos", 
      emoji: "🔬", 
      title: "Analisador de Criativos",
      description: "Analise seus criativos com IA",
      subtext: "Receba feedback detalhado sobre vídeos e imagens",
      gradient: "from-cyan-400 to-blue-500",
      restricted: true
    },
    { 
      path: "/zap-spy",
      emoji: "🔍", 
      title: "Zap Spy",
      description: "Acesse as ofertas mais escaladas de X1",
      subtext: "Encontre ofertas validadas por nicho",
      gradient: "from-accent to-yellow-400",
      restricted: false
    },
    { 
      path: "/tag-whats", 
      emoji: "🏷️", 
      title: "Tag Whats",
      description: "Marque vendas do WhatsApp automaticamente",
      subtext: "Sistema automático de marcação de vendas",
      gradient: "from-teal-400 to-emerald-500",
      restricted: true
    },
    { 
      path: "/extensao-ads", 
      emoji: "🧩", 
      title: "Extensão Ads WhatsApp",
      description: "Extensão para analisar anúncios no Chrome",
      subtext: "Filtre e salve ofertas da Biblioteca de Anúncios",
      gradient: "from-orange-400 to-amber-500",
      restricted: false
    },
    { 
      path: "/video-downloader", 
      emoji: "🎵", 
      title: "Download Vídeos TikTok",
      description: "Baixe vídeos do TikTok sem marca d'água",
      subtext: "Download grátis em MP4 ou MP3",
      gradient: "from-pink-500 to-cyan-400",
      restricted: false
    },
    { 
      path: "/maturador", 
      emoji: "🔥", 
      title: "Maturador de WhatsApp",
      description: "Aqueça seus chips com conversas naturais entre instâncias",
      subtext: "Integração com Evolution API",
      gradient: "from-green-400 to-emerald-500",
      restricted: true
    }
  ];

  const handleSystemClick = (system: typeof systems[0]) => {
    // If full member or system is not restricted, navigate normally
    if (isFullMember || !system.restricted) {
      navigate(system.path);
      return;
    }

    // Show restricted modal for non-members trying to access restricted features
    setSelectedFeatureName(system.title);
    setRestrictedModalOpen(true);
  };

  // If marketplace mode, render marketplace component
  if (mode === "marketplace") {
    return <Marketplace onModeChange={setMode} currentMode={mode} />;
  }

  return (
    <>
      <Header mode={mode} onModeChange={setMode} />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-6xl">
          <header className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">🎯 Bem-vindo!</h1>
            <p className="text-muted-foreground text-lg">
              Escolha o sistema que deseja acessar
            </p>
          </header>

          <div className="grid grid-cols-3 gap-3 md:gap-6">
            {systems.map((system) => {
              // Only show lock after loading is complete and user is confirmed as non-member
              const isLocked = !accessLoading && isFullMember === false && system.restricted;
              
              return (
                <Card 
                  key={system.path}
                  className={`cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent relative ${
                    isLocked ? 'opacity-80' : ''
                  }`}
                  onClick={() => handleSystemClick(system)}
                >
                  {isLocked && (
                    <div className="absolute top-2 right-2 z-10">
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-accent/20 flex items-center justify-center">
                        <Lock className="w-3 h-3 md:w-4 md:h-4 text-accent" />
                      </div>
                    </div>
                  )}
                  <CardHeader className="text-center p-3 md:p-6">
                    <div className="flex justify-center mb-2 md:mb-4">
                      <span className="text-3xl md:text-6xl">{system.emoji}</span>
                    </div>
                    <CardTitle className={`text-sm md:text-2xl ${
                      system.gradient 
                        ? `bg-gradient-to-r ${system.gradient} bg-clip-text text-transparent` 
                        : ''
                    }`}>
                      {system.title}
                    </CardTitle>
                    <CardDescription className="text-xs md:text-base hidden md:block">
                      {system.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                    <p className="text-sm text-muted-foreground">
                      {system.subtext}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

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
                      <Card className="h-full flex flex-col bg-black border-2 border-accent">
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
