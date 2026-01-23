import { useState } from "react";
import { useSystemAccess } from "@/hooks/useSystemAccess";
import { useCredits } from "@/hooks/useCredits";
import { Check, Infinity, Calendar, Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface SystemAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemId: string;
  onPurchaseSuccess?: () => void;
}

export const SystemAccessModal = ({
  open,
  onOpenChange,
  systemId,
  onPurchaseSuccess,
}: SystemAccessModalProps) => {
  const { getSystemPricing, purchaseAccess, daysRemaining, hasAccess } = useSystemAccess();
  const { balance, canAfford } = useCredits();
  const [purchasing, setPurchasing] = useState(false);
  const navigate = useNavigate();

  const pricing = getSystemPricing(systemId);
  const days = daysRemaining(systemId);
  const userHasAccess = hasAccess(systemId);

  if (!pricing) return null;

  const isLifetime = pricing.price_type === 'lifetime';
  const isMonthly = pricing.price_type === 'monthly';
  const canPurchase = canAfford(pricing.credit_cost);

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const success = await purchaseAccess(systemId);
      if (success) {
        toast.success(
          isLifetime
            ? `Acesso vitalício ao ${pricing.system_name} adquirido!`
            : `Assinatura do ${pricing.system_name} ativada por 30 dias!`
        );
        onPurchaseSuccess?.();
        onOpenChange(false);
      } else {
        toast.error('Erro ao processar compra. Tente novamente.');
      }
    } catch (error) {
      toast.error('Erro inesperado. Tente novamente.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleGoToMarketplace = () => {
    onOpenChange(false);
    navigate('/marketplace');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{pricing.system_name}</DialogTitle>
          <DialogDescription>
            {pricing.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Access status */}
          {userHasAccess && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium text-green-500">Você já tem acesso!</p>
                  {isLifetime ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Infinity className="h-3 w-3" /> Acesso vitalício
                    </p>
                  ) : days !== null && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {days} dias restantes
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pricing info */}
          <div className="p-4 rounded-lg bg-secondary/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {isLifetime ? 'Compra única' : 'Assinatura mensal'}
                </p>
                <p className="text-2xl font-bold">{pricing.credit_cost} <span className="text-sm font-normal">créditos</span></p>
              </div>
            </div>
          </div>

          {/* Balance info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Seu saldo atual:</span>
            <span className={`font-medium ${canPurchase ? 'text-green-500' : 'text-red-500'}`}>
              {balance.toFixed(2)} créditos
            </span>
          </div>

          {!canPurchase && (
            <Button 
              variant="outline" 
              onClick={handleGoToMarketplace} 
              className="w-full border-amber-500 text-amber-500 hover:bg-amber-500/10"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Recarregue seu saldo
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!userHasAccess && (
            <Button
              onClick={handlePurchase}
              disabled={!canPurchase || purchasing}
              className="w-full bg-accent hover:bg-accent/90"
            >
              {purchasing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  {isLifetime ? 'Comprar Acesso Vitalício' : 'Assinar por 30 dias'}
                </>
              )}
            </Button>
          )}
          
          {isMonthly && userHasAccess && days !== null && days <= 7 && (
            <Button
              onClick={handlePurchase}
              disabled={!canPurchase || purchasing}
              className="w-full bg-amber-500 hover:bg-amber-600"
            >
              {purchasing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>Renovar Assinatura (+30 dias)</>
              )}
            </Button>
          )}

          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};