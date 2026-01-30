import { useCredits } from "@/hooks/useCredits";
import { Wallet, ShoppingCart, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

interface InsufficientCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredCredits: number;
  systemName: string;
}

export const InsufficientCreditsModal = ({
  open,
  onOpenChange,
  requiredCredits,
  systemName,
}: InsufficientCreditsModalProps) => {
  const { balance } = useCredits();
  const navigate = useNavigate();
  
  const missing = Math.max(0, requiredCredits - balance);

  const handleGoToMarketplace = () => {
    onOpenChange(false);
    localStorage.setItem('homeMode', 'marketplace');
    navigate('/?tab=creditos');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-full bg-amber-500/20">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <DialogTitle className="text-xl">Créditos Insuficientes</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            Você não tem créditos suficientes para usar <strong>{systemName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 text-center">
              <p className="text-xs text-muted-foreground mb-1">Seu saldo atual</p>
              <p className="text-2xl font-bold">{balance.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">créditos</p>
            </div>
            <div className="p-4 rounded-lg bg-accent/10 border border-accent/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">Necessário</p>
              <p className="text-2xl font-bold text-accent">{requiredCredits.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">créditos</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-red-500" />
              <span className="text-sm">
                Faltam <strong className="text-red-500">{missing.toFixed(2)} créditos</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button 
            onClick={handleGoToMarketplace} 
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Recarregar Créditos
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};