import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { getProduct } from "@/utils/storage";
import { Product, Metric } from "@/types/product";
import { ArrowLeft, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
    alignment?: string;
  } | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");

  useEffect(() => {
    loadProduct();
  }, [productId]);

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
- Tipo de Campanha: ${userContext.campaignType}
- Tipo de Criativo: ${userContext.creativeType}
- Orçamento Diário: ${userContext.budget}
- Alinhamento Funil: ${userContext.alignment}
`;

      const knowledgeBase = `
BASE DE CONHECIMENTO PARA DIAGNÓSTICO:

CPL MUITO BARATO + ROAS RUIM:
- Problema: Campanha maximizar mensagem ou criativo muito aberto (lead desqualificado)
- Solução: Usar campanha de conversão compra otimizada para mensagem + melhorar segmentação do criativo

CPL CARO (> R$ 3):
- Problema: Criativo fraco ou orçamento alto demais
- Solução: Melhorar gancho do criativo + testar criativos em imagem + diminuir orçamento (R$ 6-10 para mineração)

CONVERSÃO BAIXA (< 10%):
- Problema: Campanha maximizar mensagem OU desalinhamento criativo-funil-entregava
- Solução: Mudar para conversão compra por mensagem + alinhar foto do Facebook = WhatsApp + mesmo mecanismo no funil

ROAS BAIXO (< 1.5x):
- Analisar conjuntamente CPL e conversão para diagnóstico preciso
`;

      // Fazer 4 análises separadas
      const sections = ['cpl', 'conversion', 'roas', 'summary'];
      const results: any = {};

      for (const section of sections) {
        let prompt = "";
        
        if (section === "cpl") {
          prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nComo especialista em tráfego pago, analise APENAS o CPL (Custo por Lead) destas métricas. Seja direto, profissional e use linguagem de marketing digital. Identifique:\n1. Performance geral do CPL (use os benchmarks)\n2. Tendências ao longo do tempo (houve dias bons? quando ficou ruim?)\n3. Com base no tipo de campanha e criativo do usuário, dê um diagnóstico preciso\n4. Recomendações práticas e acionáveis\n\nMantenha tom sério mas acessível. Máximo 4 parágrafos curtos.`;
        } else if (section === "conversion") {
          prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nComo especialista em tráfego pago, analise APENAS a TAXA DE CONVERSÃO destas métricas. Seja direto, profissional e use linguagem de marketing digital. Identifique:\n1. Performance geral da conversão (use os benchmarks)\n2. Tendências ao longo do tempo\n3. Com base no tipo de campanha e alinhamento de funil, dê um diagnóstico preciso\n4. Recomendações práticas e acionáveis\n\nMantenha tom sério mas acessível. Máximo 4 parágrafos curtos.`;
        } else if (section === "roas") {
          prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nComo especialista em tráfego pago, analise APENAS o ROAS destas métricas. Seja direto, profissional e use linguagem de marketing digital. Identifique:\n1. Performance geral do ROAS (use os benchmarks)\n2. Relação entre CPL, conversão e ROAS\n3. Diagnóstico preciso com base nas outras métricas\n4. Recomendações práticas para melhorar o retorno\n\nMantenha tom sério mas acessível. Máximo 4 parágrafos curtos.`;
        } else {
          prompt = `${metricsContext}\n${contextInfo}\n${knowledgeBase}\n\nComo especialista em tráfego pago, faça um RESUMO EXECUTIVO desta campanha. Seja direto e estratégico:\n1. Visão geral da performance (está dando lucro? vale a pena continuar?)\n2. Principal problema identificado\n3. Principal oportunidade de melhoria\n4. Próximos passos recomendados (máximo 3 ações prioritárias)\n\nTom executivo, direto ao ponto. Máximo 4 parágrafos curtos.`;
        }

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_LOVABLE_API_KEY}`
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "Você é um especialista em tráfego pago e análise de métricas de marketing digital. Seja profissional, direto e use linguagem que conecte com gestores de tráfego. Mantenha seriedade mas seja acessível."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 800
          })
        });

        if (!response.ok) {
          throw new Error("Erro ao gerar análise");
        }

        const data = await response.json();
        results[section] = data.choices[0].message.content;
      }

      setAnalysis(results);
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
              onClick={() => navigate(`/produto/${product.id}`)}
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
                      className="justify-start h-auto py-3 px-4 text-left"
                      onClick={() => {
                        const temp = { ...userContext, campaignType: "Conversão - Compra por Mensagem" };
                        if (Object.keys(temp).length === 4) {
                          handleQuestionResponse(temp);
                        } else {
                          setUserContext(temp as any);
                        }
                      }}
                    >
                      Conversão - Compra por Mensagem
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start h-auto py-3 px-4 text-left"
                      onClick={() => {
                        const temp = { ...userContext, campaignType: "Maximizar Mensagens" };
                        if (Object.keys(temp).length === 4) {
                          handleQuestionResponse(temp);
                        } else {
                          setUserContext(temp as any);
                        }
                      }}
                    >
                      Maximizar Mensagens
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start h-auto py-3 px-4 text-left"
                      onClick={() => {
                        const temp = { ...userContext, campaignType: "Reconhecimento/Tráfego" };
                        if (Object.keys(temp).length === 4) {
                          handleQuestionResponse(temp);
                        } else {
                          setUserContext(temp as any);
                        }
                      }}
                    >
                      Reconhecimento/Tráfego
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start h-auto py-3 px-4 text-left"
                      onClick={() => {
                        const temp = { ...userContext, campaignType: "Outro tipo" };
                        if (Object.keys(temp).length === 4) {
                          handleQuestionResponse(temp);
                        } else {
                          setUserContext(temp as any);
                        }
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
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => {
                          const temp = { ...userContext, creativeType: "Vídeo (UGC/Testimonial)" };
                          if (Object.keys(temp).length === 4) {
                            handleQuestionResponse(temp);
                          } else {
                            setUserContext(temp as any);
                          }
                        }}
                      >
                        Vídeo (UGC/Testimonial)
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => {
                          const temp = { ...userContext, creativeType: "Imagem estática" };
                          if (Object.keys(temp).length === 4) {
                            handleQuestionResponse(temp);
                          } else {
                            setUserContext(temp as any);
                          }
                        }}
                      >
                        Imagem estática
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => {
                          const temp = { ...userContext, creativeType: "Carrossel" };
                          if (Object.keys(temp).length === 4) {
                            handleQuestionResponse(temp);
                          } else {
                            setUserContext(temp as any);
                          }
                        }}
                      >
                        Carrossel
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => {
                          const temp = { ...userContext, creativeType: "Variado" };
                          if (Object.keys(temp).length === 4) {
                            handleQuestionResponse(temp);
                          } else {
                            setUserContext(temp as any);
                          }
                        }}
                      >
                        Variado
                      </Button>
                    </div>
                  </div>
                )}

                {userContext?.creativeType && (
                  <div>
                    <p className="font-semibold mb-3">3. Qual seu orçamento diário médio?</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => {
                          const temp = { ...userContext, budget: "Até R$ 10/dia" };
                          if (Object.keys(temp).length === 4) {
                            handleQuestionResponse(temp);
                          } else {
                            setUserContext(temp as any);
                          }
                        }}
                      >
                        Até R$ 10/dia
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => {
                          const temp = { ...userContext, budget: "R$ 10 - R$ 50/dia" };
                          if (Object.keys(temp).length === 4) {
                            handleQuestionResponse(temp);
                          } else {
                            setUserContext(temp as any);
                          }
                        }}
                      >
                        R$ 10 - R$ 50/dia
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => {
                          const temp = { ...userContext, budget: "R$ 50 - R$ 200/dia" };
                          if (Object.keys(temp).length === 4) {
                            handleQuestionResponse(temp);
                          } else {
                            setUserContext(temp as any);
                          }
                        }}
                      >
                        R$ 50 - R$ 200/dia
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => {
                          const temp = { ...userContext, budget: "Acima de R$ 200/dia" };
                          if (Object.keys(temp).length === 4) {
                            handleQuestionResponse(temp);
                          } else {
                            setUserContext(temp as any);
                          }
                        }}
                      >
                        Acima de R$ 200/dia
                      </Button>
                    </div>
                  </div>
                )}

                {userContext?.budget && (
                  <div>
                    <p className="font-semibold mb-3">4. Como está o alinhamento Criativo → Funil → Entregava?</p>
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4 text-left"
                        onClick={() => {
                          handleQuestionResponse({ ...userContext, alignment: "Totalmente alinhado (mesmo mecanismo e visual)" });
                        }}
                      >
                        Totalmente alinhado (mesmo mecanismo e visual)
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4 text-left"
                        onClick={() => {
                          handleQuestionResponse({ ...userContext, alignment: "Parcialmente alinhado" });
                        }}
                      >
                        Parcialmente alinhado
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-3 px-4 text-left"
                        onClick={() => {
                          handleQuestionResponse({ ...userContext, alignment: "Desalinhado ou não sei" });
                        }}
                      >
                        Desalinhado ou não sei
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

              <div className="flex gap-4">
                <Button
                  onClick={() => {
                    setAnalysis(null);
                    setUserContext(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Nova Análise
                </Button>
                <Button
                  onClick={() => navigate(`/produto/${product.id}`)}
                  className="flex-1"
                >
                  Ver Métricas Detalhadas
                </Button>
              </div>
            </div>
          )}

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucaspss" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucaspss</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default ProductAnalysis;
