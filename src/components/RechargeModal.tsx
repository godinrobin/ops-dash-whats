import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/useSplashedToast";
import { supabase } from "@/integrations/supabase/client";

interface RechargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (newBalance: number) => void;
}

const PRESET_VALUES_ROW1 = [10, 20, 50, 100, 200];
const PRESET_VALUES_ROW2 = [500, 800, 1000, 2000, 5000];

export function RechargeModal({ open, onOpenChange, onSuccess }: RechargeModalProps) {
  const { toast } = useToast();
  
  const [customAmount, setCustomAmount] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState<{
    transactionId: string;
    pixQrCode: string;
    pixCopyPaste: string;
    amount: number;
  } | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCustomAmount("");
      setSelectedAmount(null);
      setPixData(null);
      setPaymentCompleted(false);
    }
  }, [open]);

  // Polling para verificar pagamento
  useEffect(() => {
    if (!pixData || paymentCompleted) return;

    const checkPayment = async () => {
      setCheckingPayment(true);
      try {
        const { data, error } = await supabase.functions.invoke('sms-check-payment', {
          body: { transactionId: pixData.transactionId }
        });

        if (error) {
          console.error('Error checking payment:', error);
          return;
        }

        if (data.status === 'completed') {
          setPaymentCompleted(true);
          toast({ title: "Pagamento confirmado!" });
          onSuccess(data.newBalance);
        } else if (data.status === 'failed') {
          toast({ title: "Pagamento falhou ou expirou", variant: "destructive" });
          setPixData(null);
        }
      } catch (error) {
        console.error('Error checking payment:', error);
      } finally {
        setCheckingPayment(false);
      }
    };

    const interval = setInterval(checkPayment, 5000);
    return () => clearInterval(interval);
  }, [pixData, paymentCompleted, toast, onSuccess]);

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

  const handleGeneratePix = async () => {
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
      const { data, error } = await supabase.functions.invoke('sms-create-pix-charge', {
        body: { amount }
      });

      if (error) throw error;

      if (data.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }

      setPixData({
        transactionId: data.transactionId,
        pixQrCode: data.pixQrCode,
        pixCopyPaste: data.pixCopyPaste,
        amount: data.amount,
      });
    } catch (error: any) {
      console.error('Error creating PIX charge:', error);
      toast({ title: error.message || "Erro ao gerar PIX", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Código copiado!" });
  };

  if (paymentCompleted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md border-2 border-green-500">
          <DialogHeader>
            <DialogTitle className="text-center">✅ Pagamento Confirmado!</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-lg font-medium">
              R$ {pixData?.amount.toFixed(2)} adicionado ao seu saldo
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (pixData) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md border-2 border-accent">
          <DialogHeader>
            <DialogTitle className="text-center">
              Pague R$ {pixData.amount.toFixed(2)} via PIX
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <img
                src={`data:image/png;base64,${pixData.pixQrCode}`}
                alt="QR Code PIX"
                className="w-48 h-48"
              />
            </div>
            
            <div className="w-full space-y-2">
              <p className="text-sm text-muted-foreground text-center">
                Ou copie o código PIX:
              </p>
              <div className="flex gap-2">
                <Input
                  value={pixData.pixCopyPaste}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(pixData.pixCopyPaste)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {checkingPayment ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              )}
              Aguardando pagamento...
            </div>

            <Button
              variant="outline"
              onClick={() => setPixData(null)}
              className="w-full"
            >
              Cancelar e voltar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-2 border-accent">
        <DialogHeader>
          <DialogTitle className="text-center">💰 Recarregar Saldo</DialogTitle>
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
                max={1000}
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

          {/* Botão de gerar PIX */}
          <Button
            onClick={handleGeneratePix}
            disabled={loading || getFinalAmount() < 5}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando PIX...
              </>
            ) : (
              `Gerar QR Code PIX${getFinalAmount() >= 5 ? ` - R$ ${getFinalAmount().toFixed(2)}` : ''}`
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Valor mínimo: R$ 5,00 • Valor máximo: R$ 5.000,00
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
