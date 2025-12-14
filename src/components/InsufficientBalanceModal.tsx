import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, AlertCircle } from "lucide-react";

interface InsufficientBalanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecharge: () => void;
  requiredAmount?: number;
  currentBalance?: number;
}

export function InsufficientBalanceModal({ 
  open, 
  onOpenChange, 
  onRecharge,
  requiredAmount,
  currentBalance 
}: InsufficientBalanceModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-2 border-red-500/50">
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-red-500">
            <AlertCircle className="h-5 w-5" />
            Saldo Insuficiente
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <Wallet className="h-8 w-8 text-red-500" />
          </div>
          
          <p className="text-center text-muted-foreground">
            Você não possui saldo suficiente para realizar esta compra.
          </p>
          
          {currentBalance !== undefined && requiredAmount !== undefined && (
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground">
                Saldo atual: <span className="font-semibold text-red-500">R$ {currentBalance.toFixed(2).replace('.', ',')}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Necessário: <span className="font-semibold text-accent">R$ {requiredAmount.toFixed(2).replace('.', ',')}</span>
              </p>
            </div>
          )}

          <div className="flex gap-3 w-full">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                onOpenChange(false);
                onRecharge();
              }}
              className="flex-1 bg-accent hover:bg-accent/90"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Recarregar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
