import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ListOrdered } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { useRef } from "react";

const Home = () => {
  const navigate = useNavigate();
  const plugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: false })
  );

  const videos = [
    "https://www.youtube.com/embed/81hMbGdBQd0?si=u2MDyu8evv-SA8q-",
    "https://www.youtube.com/embed/7t1YRp-kl00?si=WbLtRXszAsDzQUPA",
    "https://www.youtube.com/embed/dDijem3cE7Y?si=QzquTiMkrk0pxWj4",
    "https://www.youtube.com/embed/1m4UhUWcrQU?si=kIZ9_bv2wvJ1QY-W",
    "https://www.youtube.com/embed/Eb_IMIGdXbs?si=JlLwU0aHcmhCmZ_2",
    "https://www.youtube.com/embed/FXpRT-Dsqes?si=nm1wIp6dhkRxYbC0"
  ];

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-4xl">
          <header className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">🎯 Bem-vindo!</h1>
            <p className="text-muted-foreground text-lg">
              Escolha o sistema que deseja acessar
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2"
              onClick={() => navigate("/metricas")}
            >
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <BarChart3 className="w-16 h-16 text-primary" />
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
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2"
              onClick={() => navigate("/organizador-numeros")}
            >
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <ListOrdered className="w-16 h-16 text-primary" />
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
          </div>

          <section className="mt-16">
            <h2 className="text-3xl font-bold text-center mb-8">Conteúdo</h2>
            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              plugins={[plugin.current]}
              className="w-full"
            >
              <CarouselContent>
                {videos.map((videoUrl, index) => (
                  <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                    <div className="p-1">
                      <Card className="border-2">
                        <CardContent className="p-4">
                          <div className="aspect-video">
                            <iframe
                              width="100%"
                              height="100%"
                              src={videoUrl}
                              title={`YouTube video ${index + 1}`}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              referrerPolicy="strict-origin-when-cross-origin"
                              allowFullScreen
                              className="rounded-md"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
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
