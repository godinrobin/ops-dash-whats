import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";


const Home = () => {
  const navigate = useNavigate();
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: true })
  );

  const videos = [
    { id: "81hMbGdBQd0", name: "COMO CRIAR ENTREGÁVEL COM IA" },
    { id: "dDijem3cE7Y", name: "COMO ESCALO NO WHATSAPP" },
    { id: "Eb_IMIGdXbs", name: "CRIAR WHATSAPP SEM CADASTRAR CHIP" },
    { id: "1m4UhUWcrQU", name: "MÚLTIPLOS WHATSAPP NO IPHONE" },
    { id: "FXpRT-Dsqes", name: "ORGANIZADOR DE NÚMEROS DE WHATSAPP" },
  ];

  return (
    <>
      <Header />
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
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/metricas")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">📊</span>
                </div>
                <CardTitle className="text-sm md:text-2xl">Sistema de Métricas</CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Gerencie suas métricas de produtos e acompanhe resultados
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Acompanhe investimentos, leads, conversões e ROAS
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/organizador-numeros")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">📱</span>
                </div>
                <CardTitle className="text-sm md:text-2xl">Organizador de Números</CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Organize e gerencie seus números de trabalho
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Mantenha controle de números, status e operações
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/track-ofertas")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">🎯</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
                  Track Ofertas
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Acompanhe a performance dos anúncios de seus concorrentes
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Monitore anúncios ativos e tendências diariamente
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/criador-funil")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">💬</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
                  Criador de Funil
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Crie funis de vendas personalizados para WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Gere scripts de vendas completos com IA
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/gerador-criativos")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">🖼️</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                  Gerador de Criativos em Imagem
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Crie imagens profissionais para anúncios com IA
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Gere criativos de alta qualidade automaticamente
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/gerador-variacoes-video")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">🎬</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-violet-400 to-fuchsia-500 bg-clip-text text-transparent">
                  Gerador de Criativos em Vídeo
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Crie variações de anúncios combinando vídeos
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Combine hooks, corpos e CTAs automaticamente
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/gerador-audio")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">🎙️</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent">
                  Gerador de Áudio
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Transforme texto em áudio com vozes realistas
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Gere áudios profissionais com IA
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/transcricao-audio")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">📝</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">
                  Transcrição de Áudio
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Converta áudios em texto automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Transcreva áudios MP3, OGG e OPUS
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/zap-spy")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">🔍</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-accent to-yellow-400 bg-clip-text text-transparent">
                  Zap Spy
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Acesse as ofertas mais escaladas de X1
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Encontre ofertas validadas por nicho
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/tag-whats")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">🏷️</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent">
                  Tag Whats
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Marque vendas do WhatsApp automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Sistema automático de marcação de vendas
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/sms-bot")}
            >
              <CardHeader className="text-center p-3 md:p-6">
                <div className="flex justify-center mb-2 md:mb-4">
                  <span className="text-3xl md:text-6xl">📲</span>
                </div>
                <CardTitle className="text-sm md:text-2xl bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                  SMS Bot
                </CardTitle>
                <CardDescription className="text-xs md:text-base hidden md:block">
                  Compre números virtuais para receber SMS
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center p-3 pt-0 md:p-6 md:pt-0 hidden md:block">
                <p className="text-sm text-muted-foreground">
                  Números temporários para verificação
                </p>
              </CardContent>
            </Card>
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
    </>
  );
};

export default Home;
