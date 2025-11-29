import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { getProduct } from "@/utils/storage";
import { Product, Metric } from "@/types/product";
import { ArrowLeft, TrendingUp, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ProductAnalysis = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<{
    cpl: string;
    conversion: string;
    roas: string;
    summary: string;
  } | null>(null);
  const [userContext, setUserContext] = useState<{
    campaignType?: string;
    creativeType?: string;
    budget?: string;
  } | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");

  useEffect(() => {
    loadProduct();
    loadSavedAnalysis();
  }, [productId]);

  const loadSavedAnalysis = () => {
    if (!productId) return;
    const saved = localStorage.getItem(`analysis_${productId}`);
    if (saved) {
      const { analysis: savedAnalysis, context: savedContext } = JSON.parse(saved);
      setAnalysis(savedAnalysis);
      setUserContext(savedContext);
    }
  };

  const saveAnalysis = (analysisData: any, contextData: any) => {
    if (!productId) return;
    localStorage.setItem(`analysis_${productId}`, JSON.stringify({
      analysis: analysisData,
      context: contextData
    }));
  };

  const loadProduct = async () => {
    if (!productId) return;
    
    setLoading(true);
    const foundProduct = await getProduct(productId);
    if (foundProduct) {
      setProduct(foundProduct);
    } else {
      navigate("/");
    }
    setLoading(false);
  };

  const calculateMetrics = (metrics: Metric[]) => {
    if (metrics.length === 0) {
      return {
        avgCPL: 0,
        minCPL: 0,
        maxCPL: 0,
        avgConversion: 0,
        minConversion: 0,
        maxConversion: 0,
        avgROAS: 0,
        minROAS: 0,
        maxROAS: 0,
        totalInvested: 0,
        totalLeads: 0,
        totalPixCount: 0,
        totalPixTotal: 0,
        totalResult: 0
      };
    }

    const cpls = metrics.map(m => m.cpl);
    const conversions = metrics.map(m => m.conversion);
    const roases = metrics.map(m => m.roas);

    return {
      avgCPL: cpls.reduce((a, b) => a + b, 0) / cpls.length,
      minCPL: Math.min(...cpls),
      maxCPL: Math.max(...cpls),
      avgConversion: conversions.reduce((a, b) => a + b, 0) / conversions.length,
      minConversion: Math.min(...conversions),
      maxConversion: Math.max(...conversions),
      avgROAS: roases.reduce((a, b) => a + b, 0) / roases.length,
      minROAS: Math.min(...roases),
      maxROAS: Math.max(...roases),
      totalInvested: metrics.reduce((a, b) => a + b.invested, 0),
      totalLeads: metrics.reduce((a, b) => a + b.leads, 0),
      totalPixCount: metrics.reduce((a, b) => a + b.pixCount, 0),
      totalPixTotal: metrics.reduce((a, b) => a + b.pixTotal, 0),
      totalResult: metrics.reduce((a, b) => a + b.result, 0)
    };
  };

  const analyzeMetrics = async () => {
    if (!product || product.metrics.length === 0) {
      toast.error("Não há métricas suficientes para análise");
      return;
    }

    setAnalyzing(true);

    try {
      const stats = calculateMetrics(product.metrics);
      
      // Preparar contexto das métricas
      const metricsContext = `
Produto: ${product.name}
Total de registros: ${product.metrics.length}
Período: ${product.metrics[0]?.date} até ${product.metrics[product.metrics.length - 1]?.date}

MÉTRICAS GERAIS:
- Investimento Total: R$ ${stats.totalInvested.toFixed(2)}
- Leads Totais: ${stats.totalLeads}
- Vendas (Pix): ${stats.totalPixCount} (R$ ${stats.totalPixTotal.toFixed(2)})
- Resultado Total: R$ ${stats.totalResult.toFixed(2)}

CPL (Custo por Lead):
- Média: R$ ${stats.avgCPL.toFixed(2)}
- Mínimo: R$ ${stats.minCPL.toFixed(2)} 
- Máximo: R$ ${stats.maxCPL.toFixed(2)}
Benchmark: CPL < R$ 1,00 (barato) | CPL > R$ 3,00 (caro)

TAXA DE CONVERSÃO:
- Média: ${stats.avgConversion.toFixed(2)}%
- Mínima: ${stats.minConversion.toFixed(2)}%
- Máxima: ${stats.maxConversion.toFixed(2)}%
Benchmark: > 15% (bom) | < 10% (baixo)

ROAS (Retorno sobre investimento):
- Médio: ${stats.avgROAS.toFixed(2)}x
- Mínimo: ${stats.minROAS.toFixed(2)}x
- Máximo: ${stats.maxROAS.toFixed(2)}x
Benchmark: ROAS > 2x (bom) | ROAS < 1.5x (baixo)

DADOS POR DATA E ESTRUTURA:
${product.metrics.slice(-10).map(m => `
Data: ${m.date} | Estrutura: ${m.structure}
Investido: R$ ${m.invested} | Leads: ${m.leads} | CPL: R$ ${m.cpl.toFixed(2)}
Pix: ${m.pixCount} (R$ ${m.pixTotal}) | Conversão: ${m.conversion.toFixed(2)}% | ROAS: ${m.roas.toFixed(2)}x
`).join('\n')}
`;

      // Se ainda não tem contexto do usuário, fazer perguntas
      if (!userContext) {
        setCurrentQuestion("questions");
        setAnalyzing(false);
        return;
      }

      const contextInfo = `
CONTEXTO DO USUÁRIO:
- Tipo de Campanha: ${userContext.campaignType || 'Não informado'}
- Tipo de Criativo: ${userContext.creativeType || 'Não informado'}
- Orçamento Diário por Campanha: ${userContext.budget || 'Não informado'}

CONTEXTO ADICIONAL PARA ANÁLISE:
- O orçamento diário informado pelo usuário é INDIVIDUAL POR CAMPANHA, não o total da conta
- Assume-se alinhamento padrão entre criativo, funil e entregável
- Se houver problemas de conversão, considerar possível desalinhamento
`;

      const knowledgeBase = `
BASE DE CONHECIMENTO PARA DIAGNÓSTICO:

PARÂMETROS DE CPL (NÃO MENCIONAR VALORES EXPLICITAMENTE AO USUÁRIO):
- Campanhas de Compra por Mensagem: CPL normal entre R$ 1,50 - R$ 3,50
- Campanhas de Maximizar Conversas: CPL normal entre R$ 0,40 - R$ 1,50
- Campanhas de Conversão otimizada para vendas: CPL normal acima de R$ 3,00 (mais caro é esperado)
- Abaixo destes valores = performance excelente
- Acima destes valores = CPL caro (exceto conversão para vendas)

CPL MUITO BARATO + ROAS RUIM:
- Problema: Campanha maximizar mensagem ou criativo muito aberto (lead desqualificado)
- Solução: Usar campanha de conversão compra otimizada para mensagem + melhorar segmentação do criativo

CPL CARO:
- Problema Principal: GANCHO DO CRIATIVO FRACO (primeiros 3 segundos)
- Solução: Melhorar gancho do criativo (primeiros 3 segundos são cruciais) + testar criativos em imagem
- Teste de Orçamento: Um bom teste seria reduzir orçamento (R$ 6-10 para mineração de novos criativos)
- Para conversão otimizada para vendas: foco em melhorar gancho do criativo e qualidade do lead
- NÃO é necessariamente falta de qualificação, melhorando o gancho já pode diminuir muito o CPL

CONVERSÃO BAIXA (< 10%):
- Problema: Campanha maximizar mensagem OU desalinhamento criativo-funil-entregável
- Solução: Mudar para conversão compra por mensagem + alinhar foto do Facebook = WhatsApp + mesmo mecanismo no funil

CONVERSÃO BOA (> 15%):
- Se a conversão está boa, NÃO sugerir melhorias nela
- Focar apenas nos outros problemas (CPL ou ROAS)

ROAS BAIXO (< 1.5x):
- Analisar conjuntamente CPL e conversão para diagnóstico preciso

SUGESTÕES DE TREINAMENTO (baseado nos problemas identificados):

Para problemas de CONVERSÃO ou FUNIL:
- "Automação de WhatsApp" do Starter Whats - criar funil de WhatsApp com mais coerência
- "Crie seu ebook com IA" do Starter Whats - criar entregável único e coerente
- "Crie seu entregável em formato de App com IA" do Starter Whats - aumentar valor agregado
- "Analisando Métricas (Funil)" do Starter Whats - analisar métricas do funil

Para problemas de CPL ou CAMPANHAS:
- "Subindo ads" do Starter Whats - subir campanhas de forma mais assertiva
- "Analisando Métricas (Anúncios)" do Starter Whats - analisar métricas de anúncios

Para OTIMIZAÇÃO AVANÇADA:
- "TRACKEAMENTO ALÉM DA ETIQUETA" do Rataria Digital - enviar eventos de compra para melhor otimização
- "Como destravar COMPRAR POR MENSAGEM" do Rataria Digital - desbloquear otimização de compra por mensagem

RECURSOS GERAIS:
- "Funis e Entregáveis" do Starter Whats - acesso a funis e entregáveis validados
`;

      // Fazer 4 análises separadas usando edge function
      const sections = ['cpl', 'conversion', 'roas', 'summary'];
      const results: any = {};

      for (const section of sections) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-metrics`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
            },
            body: JSON.stringify({
              metricsContext,
              contextInfo,
              knowledgeBase,
              section
            })
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Erro ao gerar análise");
        }

        const data = await response.json();
        results[section] = data.content;
      }

      setAnalysis(results);
      saveAnalysis(results, userContext);
      toast.success("Análise gerada com sucesso!");
    } catch (error) {
      console.error("Erro ao analisar:", error);
      toast.error("Erro ao gerar análise. Tente novamente.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleQuestionResponse = (responses: any) => {
    setUserContext(responses);
    setCurrentQuestion("");
    // Após coletar respostas, iniciar análise
    setTimeout(() => analyzeMetrics(), 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background pb-24">
        <div className="container mx-auto max-w-5xl p-6 md:p-10">
          <header className="mb-8">
            <Button
              variant="secondary"
              onClick={() => navigate("/")}
              className="mb-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-8 w-8 text-accent" />
              <h1 className="text-3xl md:text-4xl font-bold">Análise de Performance</h1>
            </div>
            <p className="text-muted-foreground">{product.name}</p>
          </header>

          {product.metrics.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">
                  Adicione métricas ao produto para gerar a análise de performance.
                </p>
              </CardContent>
            </Card>
          ) : currentQuestion === "questions" ? (
            <Card>
              <CardHeader>
                <CardTitle>Contexto da Campanha</CardTitle>
                <CardDescription>
                  Responda algumas perguntas para uma análise mais precisa e recomendações personalizadas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="font-semibold mb-3">1. Qual tipo de campanha você está usando?</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className={`justify-start h-auto py-3 px-4 text-left ${
                        userContext?.campaignType === "Conversão - Compra por Mensagem" 
                          ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                          : ""
                      }`}
                      onClick={() => {
                        const temp = { ...userContext, campaignType: "Conversão - Compra por Mensagem" };
                        setUserContext(temp as any);
                      }}
                    >
                      Conversão - Compra por Mensagem
                    </Button>
                    <Button
                      variant="outline"
                      className={`justify-start h-auto py-3 px-4 text-left ${
                        userContext?.campaignType === "Maximizar Mensagens" 
                          ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                          : ""
                      }`}
                      onClick={() => {
                        const temp = { ...userContext, campaignType: "Maximizar Mensagens" };
                        setUserContext(temp as any);
                      }}
                    >
                      Maximizar Mensagens
                    </Button>
                    <Button
                      variant="outline"
                      className={`justify-start h-auto py-3 px-4 text-left ${
                        userContext?.campaignType === "Conversão otimizada para vendas" 
                          ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                          : ""
                      }`}
                      onClick={() => {
                        const temp = { ...userContext, campaignType: "Conversão otimizada para vendas" };
                        setUserContext(temp as any);
                      }}
                    >
                      Conversão otimizada para vendas
                    </Button>
                    <Button
                      variant="outline"
                      className={`justify-start h-auto py-3 px-4 text-left ${
                        userContext?.campaignType === "Outro tipo" 
                          ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                          : ""
                      }`}
                      onClick={() => {
                        const temp = { ...userContext, campaignType: "Outro tipo" };
                        setUserContext(temp as any);
                      }}
                    >
                      Outro tipo
                    </Button>
                  </div>
                </div>

                {userContext?.campaignType && (
                  <div>
                    <p className="font-semibold mb-3">2. Qual tipo de criativo você está usando?</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className={`justify-start h-auto py-3 px-4 ${
                          userContext?.creativeType === "Vídeo" 
                            ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                            : ""
                        }`}
                        onClick={() => {
                          const temp = { ...userContext, creativeType: "Vídeo" };
                          setUserContext(temp as any);
                        }}
                      >
                        Vídeo
                      </Button>
                      <Button
                        variant="outline"
                        className={`justify-start h-auto py-3 px-4 ${
                          userContext?.creativeType === "Imagem" 
                            ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                            : ""
                        }`}
                        onClick={() => {
                          const temp = { ...userContext, creativeType: "Imagem" };
                          setUserContext(temp as any);
                        }}
                      >
                        Imagem
                      </Button>
                    </div>
                  </div>
                )}

                {userContext?.creativeType && (
                  <div>
                    <p className="font-semibold mb-3">3. Qual seu orçamento diário por campanha?</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className={`justify-start h-auto py-3 px-4 ${
                          userContext?.budget === "Até R$ 10/dia" 
                            ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                            : ""
                        }`}
                        onClick={() => {
                          const temp = { ...userContext, budget: "Até R$ 10/dia" };
                          handleQuestionResponse(temp);
                        }}
                      >
                        Até R$ 10/dia
                      </Button>
                      <Button
                        variant="outline"
                        className={`justify-start h-auto py-3 px-4 ${
                          userContext?.budget === "R$ 10 - R$ 50/dia" 
                            ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                            : ""
                        }`}
                        onClick={() => {
                          const temp = { ...userContext, budget: "R$ 10 - R$ 50/dia" };
                          handleQuestionResponse(temp);
                        }}
                      >
                        R$ 10 - R$ 50/dia
                      </Button>
                      <Button
                        variant="outline"
                        className={`justify-start h-auto py-3 px-4 ${
                          userContext?.budget === "R$ 50 - R$ 200/dia" 
                            ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                            : ""
                        }`}
                        onClick={() => {
                          const temp = { ...userContext, budget: "R$ 50 - R$ 200/dia" };
                          handleQuestionResponse(temp);
                        }}
                      >
                        R$ 50 - R$ 200/dia
                      </Button>
                      <Button
                        variant="outline"
                        className={`justify-start h-auto py-3 px-4 ${
                          userContext?.budget === "Acima de R$ 200/dia" 
                            ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" 
                            : ""
                        }`}
                        onClick={() => {
                          const temp = { ...userContext, budget: "Acima de R$ 200/dia" };
                          handleQuestionResponse(temp);
                        }}
                      >
                        Acima de R$ 200/dia
                      </Button>
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          ) : !analysis ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <Button
                  size="lg"
                  onClick={analyzeMetrics}
                  disabled={analyzing}
                  className="bg-accent hover:bg-accent/90"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="mr-2 h-5 w-5" />
                      Gerar Análise Profissional
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground mt-4">
                  Análise detalhada com diagnóstico e recomendações personalizadas
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="flex gap-4 mb-6">
                <Button
                  onClick={() => {
                    setAnalysis(null);
                    setUserContext(null);
                    setCurrentQuestion("questions");
                    if (productId) {
                      localStorage.removeItem(`analysis_${productId}`);
                    }
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Informar Novo Contexto
                </Button>
                <Button
                  onClick={() => navigate(`/produto/${product.id}`)}
                  className="flex-1"
                >
                  Ver Métricas Detalhadas
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">💰</span>
                    Análise de CPL (Custo por Lead)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                    {analysis.cpl}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">📈</span>
                    Análise de Taxa de Conversão
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                    {analysis.conversion}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">🎯</span>
                    Análise de ROAS (Retorno)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                    {analysis.roas}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-accent/50 bg-accent/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">🎓</span>
                    Resumo Executivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap font-medium">
                    {analysis.summary}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-orange-500/50 bg-orange-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">🎯</span>
                    Acelere Seus Resultados
                  </CardTitle>
                  <CardDescription>
                    Quer aplicar essas estratégias com apoio de especialistas? Conheça nossos treinamentos completos.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    size="lg"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold"
                    onClick={() => window.open('https://link.joaolucassps.co/', '_blank')}
                  >
                    TREINAMENTO X1
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default ProductAnalysis;
