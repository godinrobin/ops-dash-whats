import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/metricas")}
            >
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <span className="text-6xl">📊</span>
                </div>
                <CardTitle className="text-2xl">Sistema de Métricas</CardTitle>
                <CardDescription className="text-base">
                  Gerencie suas métricas de produtos e acompanhe resultados
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-sm text-muted-foreground">
                  Acompanhe investimentos, leads, conversões e ROAS
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/organizador-numeros")}
            >
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <span className="text-6xl">📱</span>
                </div>
                <CardTitle className="text-2xl">Organizador de Números</CardTitle>
                <CardDescription className="text-base">
                  Organize e gerencie seus números de trabalho
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-sm text-muted-foreground">
                  Mantenha controle de números, status e operações
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-accent"
              onClick={() => navigate("/track-ofertas")}
            >
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <span className="text-6xl">🎯</span>
                </div>
                <CardTitle className="text-2xl bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
                  Track Ofertas
                </CardTitle>
                <CardDescription className="text-base">
                  Acompanhe a performance dos anúncios de seus concorrentes
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-sm text-muted-foreground">
                  Monitore anúncios ativos e tendências diariamente
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
            Criado por <a href="https://instagram.com/joaolucaspss" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucaspss</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default Home;
