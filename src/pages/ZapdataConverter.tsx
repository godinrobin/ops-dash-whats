import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ExchangeRate {
  rate: number;
  lastUpdated: string;
}

const ZapdataConverter = () => {
  const [currency, setCurrency] = useState<"BRL" | "USD">("BRL");
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate>({ rate: 5.12, lastUpdated: "" });
  const [isLoading, setIsLoading] = useState(false);

  // Demo values in USD (base currency)
  const demoValues = {
    dailyCost: 293.00,
    totalSpend: 8789.06,
    avgCpc: 0.46,
    cpm: 2.44,
  };

  const fetchExchangeRate = async () => {
    setIsLoading(true);
    try {
      // Using a free exchange rate API
      const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
      const data = await response.json();
      setExchangeRate({
        rate: data.rates.BRL,
        lastUpdated: new Date().toLocaleTimeString("pt-BR"),
      });
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
      // Fallback rate
      setExchangeRate({
        rate: 5.12,
        lastUpdated: new Date().toLocaleTimeString("pt-BR"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExchangeRate();
  }, []);

  const formatCurrency = (value: number, curr: "BRL" | "USD") => {
    if (curr === "BRL") {
      return `R$ ${(value * exchangeRate.rate).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$ ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleDownload = () => {
    window.open("https://joaolucassps.co/zapdataconverter.zip", "_blank");
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-4xl px-4 py-12">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-accent via-orange-400 to-accent bg-clip-text text-transparent">
                Zapdata Converter ADS
              </span>
              <br />
              <span className="text-foreground">para Meta Ads</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
              Converta valores entre Real e Dólar diretamente no Meta Ads Manager.
              <br />
              Toggle intuitivo, cotação em tempo real e conversão automática.
            </p>

            <Button
              onClick={handleDownload}
              size="lg"
              className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
            >
              <Download className="w-5 h-5" />
              Download Gratuito
            </Button>
          </motion.div>

          {/* Interactive Demo */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <span className="text-muted-foreground">Demonstração Interativa</span>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>1 USD = R$ {exchangeRate.rate.toFixed(2)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={fetchExchangeRate}
                    disabled={isLoading}
                    className="h-7 w-7"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              {/* Currency Toggle */}
              <div className="flex justify-center mb-8">
                <div className="flex items-center bg-secondary/50 rounded-full p-1 border border-border">
                  <button
                    onClick={() => setCurrency("BRL")}
                    className={`
                      flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all
                      ${currency === "BRL" 
                        ? "bg-accent text-accent-foreground shadow-lg" 
                        : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    <span className="text-lg">🇧🇷</span>
                    BRL
                  </button>
                  <button
                    onClick={() => setCurrency("USD")}
                    className={`
                      flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all
                      ${currency === "USD" 
                        ? "bg-accent text-accent-foreground shadow-lg" 
                        : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    <span className="text-lg">🇺🇸</span>
                    USD
                  </button>
                </div>
              </div>

              {/* Values Grid */}
              <div className="grid grid-cols-2 gap-4">
                <ValueCard
                  label="Custo por Dia"
                  value={formatCurrency(demoValues.dailyCost, currency)}
                  currency={currency}
                />
                <ValueCard
                  label="Gasto Total"
                  value={formatCurrency(demoValues.totalSpend, currency)}
                  currency={currency}
                />
                <ValueCard
                  label="CPC Médio"
                  value={formatCurrency(demoValues.avgCpc, currency)}
                  currency={currency}
                />
                <ValueCard
                  label="CPM"
                  value={formatCurrency(demoValues.cpm, currency)}
                  currency={currency}
                />
              </div>

              {/* Footer */}
              <p className="text-center text-muted-foreground text-sm mt-8">
                Clique nos botões acima para ver a conversão em tempo real
              </p>
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <FeatureCard
              emoji="💱"
              title="Conversão Instantânea"
              description="Toggle entre Real e Dólar com um clique diretamente no Meta Ads"
            />
            <FeatureCard
              emoji="📊"
              title="Cotação em Tempo Real"
              description="Taxa de câmbio atualizada automaticamente para valores precisos"
            />
            <FeatureCard
              emoji="🎯"
              title="Integração Nativa"
              description="Funciona perfeitamente dentro do Gerenciador de Anúncios"
            />
          </motion.div>
        </div>
      </div>
    </>
  );
};

const ValueCard = ({ label, value, currency }: { label: string; value: string; currency: string }) => {
  return (
    <motion.div
      key={value}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="bg-secondary/30 rounded-xl p-4 border border-border/50"
    >
      <p className="text-muted-foreground text-sm mb-1">{label}</p>
      <p className="text-xl md:text-2xl font-bold text-foreground">{value}</p>
    </motion.div>
  );
};

const FeatureCard = ({ emoji, title, description }: { emoji: string; title: string; description: string }) => {
  return (
    <div className="bg-card/50 border border-border rounded-xl p-6 text-center">
      <div className="text-3xl mb-3">{emoji}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
};

export default ZapdataConverter;