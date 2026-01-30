import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CreditCard, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/useSplashedToast";
import { supabase } from "@/integrations/supabase/client";

interface CardRechargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
}

const PRESET_VALUES_ROW1 = [10, 20, 50, 100, 200];
const PRESET_VALUES_ROW2 = [500, 800, 1000, 2000, 5000];

export function CardRechargeModal({ open, onOpenChange, onBack }: CardRechargeModalProps) {
  const { toast } = useToast();
  
  const [customAmount, setCustomAmount] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCustomAmount("");
      setSelectedAmount(null);
    }
  }, [open]);

  const handleSelectAmount = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount(amount.toString());
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedAmount(null);
  };

  const getFinalAmount = (): number => {
    if (selectedAmount) return selectedAmount;
    const parsed = parseFloat(customAmount);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handlePay = async () => {
    const amount = getFinalAmount();
    
    if (amount < 5) {
      toast({ title: "Valor mínimo: R$ 5,00", variant: "destructive" });
      return;
    }

    if (amount > 5000) {
      toast({ title: "Valor máximo: R$ 5.000,00", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-create-checkout', {
        body: { amount }
      });

      if (error) throw error;

      if (data.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Error creating checkout:', error);
      toast({ title: error.message || "Erro ao preparar pagamento", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-2 border-accent">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-accent" />
              Recarga via Cartão/PIX
            </DialogTitle>
          </div>
          <DialogDescription>
            Escolha o valor e pague com cartão ou PIX
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Campo de valor personalizado */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Valor personalizado</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                placeholder="0,00"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className="pl-10"
                min={5}
                max={5000}
                step={0.01}
              />
            </div>
          </div>

          {/* Valores pré-definidos */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ou escolha um valor</label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_VALUES_ROW1.map((value) => (
                <Button
                  key={value}
                  variant={selectedAmount === value ? "default" : "outline"}
                  onClick={() => handleSelectAmount(value)}
                  className={`${selectedAmount === value ? "bg-accent text-accent-foreground" : ""} text-sm px-2`}
                >
                  R$ {value}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_VALUES_ROW2.map((value) => (
                <Button
                  key={value}
                  variant={selectedAmount === value ? "default" : "outline"}
                  onClick={() => handleSelectAmount(value)}
                  className={`${selectedAmount === value ? "bg-accent text-accent-foreground" : ""} text-sm px-2`}
                >
                  R$ {value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                </Button>
              ))}
            </div>
          </div>

          {/* Botão de pagar */}
          <Button
            onClick={handlePay}
            disabled={loading || getFinalAmount() < 5}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Redirecionando...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                {getFinalAmount() >= 5 
                  ? `Pagar R$ ${getFinalAmount().toFixed(2)}`
                  : 'Pagar'
                }
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Valor mínimo: R$ 5,00 • Valor máximo: R$ 5.000,00
          </p>
          <p className="text-xs text-center text-muted-foreground">
            Você será redirecionado para o checkout seguro da <strong>Stripe</strong>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
