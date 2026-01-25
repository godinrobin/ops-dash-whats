import { useCredits } from "@/hooks/useCredits";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { Wallet, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface CreditWalletDisplayProps {
  compact?: boolean;
  showTransactions?: boolean;
}

export const CreditWalletDisplay = ({ compact = false, showTransactions = false }: CreditWalletDisplayProps) => {
  const { balance, loading, transactions, creditsToReais } = useCredits();
  const { isActive } = useCreditsSystem();
  const navigate = useNavigate();

  // Don't show if credits system is not active
  if (!isActive) {
    return null;
  }

  if (loading) {
    return (
      <Card className="border-accent/20">
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20"
      >
        <Wallet className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold text-accent">{balance.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">créditos</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-accent/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-accent/20">
                <Wallet className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sua Carteira</p>
                <p className="text-2xl font-bold">{balance.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">créditos</span></p>
              </div>
            </div>
          </div>

          <Button
            onClick={() => navigate('/marketplace?tab=credits')}
            className="w-full bg-accent hover:bg-accent/90"
            size="sm"
          >
            Recarregar Créditos
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>

          {showTransactions && transactions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Últimas transações</p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {tx.amount > 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-xs truncate max-w-[150px]">{tx.description}</span>
                    </div>
                    <span className={`font-medium ${tx.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
