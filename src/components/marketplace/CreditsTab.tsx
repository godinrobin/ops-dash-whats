import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Sparkles, Zap, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_brl: number;
  is_active: boolean;
  sort_order: number;
}

interface CreditsTabProps {
  onRecharge: () => void;
}

export const CreditsTab = ({ onRecharge }: CreditsTabProps) => {
  const { user } = useAuth();
  const { balance, refresh: refreshCredits, creditsToReais } = useCredits();
  const { isActive } = useCreditsSystem();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setPackages(data || []);
    } catch (err) {
      console.error("Error loading packages:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pkg: CreditPackage) => {
    if (!user) return;
    
    setPurchasing(pkg.id);
    
    try {
      // TODO: Implement PIX payment flow
      // For now, show message that credits need to be purchased
      toast.info(
        "Para comprar créditos, faça uma recarga na carteira e depois volte aqui!",
        {
          description: `Pacote: ${pkg.name} - R$ ${pkg.price_brl.toFixed(2).replace('.', ',')}`,
          duration: 5000,
        }
      );
      onRecharge();
    } catch (err) {
      console.error("Error purchasing:", err);
      toast.error("Erro ao processar compra");
    } finally {
      setPurchasing(null);
    }
  };

  const getPackageIcon = (credits: number) => {
    if (credits >= 100) return <Sparkles className="h-6 w-6" />;
    if (credits >= 50) return <Zap className="h-6 w-6" />;
    return <Coins className="h-6 w-6" />;
  };

  const getPackageColor = (credits: number) => {
    if (credits >= 100) return "from-amber-500/20 to-orange-500/20 border-amber-500/50";
    if (credits >= 50) return "from-purple-500/20 to-pink-500/20 border-purple-500/50";
    return "from-accent/20 to-orange-500/20 border-accent/50";
  };

  if (!isActive) {
    return (
      <Card className="border-accent/30">
        <CardContent className="p-8 text-center">
          <Coins className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Sistema de Créditos Desativado</h3>
          <p className="text-muted-foreground">
            O sistema de créditos ainda não está ativo. Quando ativado, você poderá comprar pacotes de créditos aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Balance Card */}
      <Card className="bg-gradient-to-r from-accent/20 to-orange-500/20 border-accent">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-accent/20 rounded-full">
                <Coins className="h-8 w-8 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Seu saldo de créditos</p>
                <p className="text-3xl font-bold text-accent">{balance.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">
                  ≈ {creditsToReais(balance)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Packages Grid */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          Pacotes de Créditos
        </h3>

        {packages.length === 0 ? (
          <Card className="border-border">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                Nenhum pacote disponível no momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map((pkg, index) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card 
                  className={`bg-gradient-to-br ${getPackageColor(pkg.credits)} hover:scale-[1.02] transition-transform cursor-pointer`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2 bg-background/50 rounded-lg">
                        {getPackageIcon(pkg.credits)}
                      </div>
                      {pkg.credits >= 100 && (
                        <Badge className="bg-amber-500 text-white">
                          Popular
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl">{pkg.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-3xl font-bold">
                        {pkg.credits} <span className="text-lg font-normal text-muted-foreground">créditos</span>
                      </p>
                      <p className="text-2xl font-semibold text-green-500 mt-1">
                        R$ {pkg.price_brl.toFixed(2).replace('.', ',')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        R$ {(pkg.price_brl / pkg.credits).toFixed(2).replace('.', ',')} por crédito
                      </p>
                    </div>

                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span>Créditos não expiram</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span>Use em todos os sistemas</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span>Ativação instantânea</span>
                      </li>
                    </ul>

                    <Button
                      className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                      onClick={() => handlePurchase(pkg)}
                      disabled={purchasing === pkg.id}
                    >
                      {purchasing === pkg.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Coins className="h-4 w-4 mr-2" />
                          Comprar Agora
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <Card className="border-border bg-secondary/30">
        <CardContent className="p-6">
          <h4 className="font-semibold mb-3">Como funcionam os créditos?</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Os créditos são a moeda virtual da plataforma</li>
            <li>• Use para acessar sistemas premium e funcionalidades avançadas</li>
            <li>• Cada sistema tem seu próprio custo em créditos</li>
            <li>• Créditos não expiram e podem ser usados a qualquer momento</li>
            <li>• Membros completos têm benefícios exclusivos como uso gratuito limitado</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
