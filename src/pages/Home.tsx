import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ListOrdered } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();

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

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucaspss" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucaspss</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default Home;
