import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Lock, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/useSplashedToast";
import { supabase } from "@/integrations/supabase/client";
import { loadStripe } from "@stripe/stripe-js";
import { 
  Elements, 
  CardNumberElement, 
  CardExpiryElement, 
  CardCvcElement, 
  useStripe, 
  useElements 
} from "@stripe/react-stripe-js";

interface AddPaymentMethodModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const elementStyle = {
  base: {
    fontSize: '16px',
    color: '#ffffff',
    '::placeholder': {
      color: '#71717a',
    },
    iconColor: '#f97316',
  },
  invalid: {
    color: '#ef4444',
    iconColor: '#ef4444',
  },
};

function CardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [expiryComplete, setExpiryComplete] = useState(false);
  const [cvvComplete, setCvvComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      toast({ title: "Stripe não carregado", variant: "destructive" });
      return;
    }

    const cardNumberElement = elements.getElement(CardNumberElement);
    if (!cardNumberElement) {
      toast({ title: "Elemento de cartão não encontrado", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      // Create SetupIntent
      const { data, error } = await supabase.functions.invoke('manage-payment-methods', {
        body: { action: 'create-setup-intent' },
      });

      if (error || !data?.clientSecret) throw new Error(data?.error || 'Erro ao criar setup');

      // Confirm SetupIntent with card
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(data.clientSecret, {
        payment_method: {
          card: cardNumberElement,
        },
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (setupIntent?.status === 'succeeded' && setupIntent.payment_method) {
        // Save payment method to database
        await supabase.functions.invoke('manage-payment-methods', {
          body: { 
            action: 'save-payment-method', 
            paymentMethodId: setupIntent.payment_method,
          },
        });

        setSuccess(true);
        toast({ title: 'Cartão salvo com sucesso!' });
        setTimeout(onSuccess, 1500);
      }
    } catch (err: any) {
      console.error("Error:", err);
      toast({ 
        title: err.message || "Erro ao salvar cartão", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <CheckCircle2 className="h-16 w-16 text-accent animate-in zoom-in-50 duration-300" />
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-accent">Cartão Salvo!</h3>
          <p className="text-sm text-muted-foreground">
            Seu cartão foi adicionado com sucesso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Número do Cartão</label>
          <div className="bg-card border border-border rounded-md px-3 py-3 h-11 flex items-center [&_.StripeElement]:w-full">
            <CardNumberElement 
              options={{ style: elementStyle, showIcon: true }} 
              onChange={(e) => setCardComplete(e.complete)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Validade</label>
            <div className="bg-card border border-border rounded-md px-3 py-3 h-11 flex items-center [&_.StripeElement]:w-full">
              <CardExpiryElement 
                options={{ style: elementStyle }} 
                onChange={(e) => setExpiryComplete(e.complete)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">CVV</label>
            <div className="bg-card border border-border rounded-md px-3 py-3 h-11 flex items-center [&_.StripeElement]:w-full">
              <CardCvcElement 
                options={{ style: elementStyle }} 
                onChange={(e) => setCvvComplete(e.complete)}
              />
            </div>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={!stripe || loading || !cardComplete || !expiryComplete || !cvvComplete}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 h-11"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 mr-2" />
            Salvar Cartão
          </>
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
        <Lock className="h-3 w-3" />
        Seus dados são criptografados e seguros.
      </p>
    </form>
  );
}

export function AddPaymentMethodModal({ open, onOpenChange, onSuccess }: AddPaymentMethodModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-2 border-accent">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-accent" />
            Adicionar Cartão
          </DialogTitle>
          <DialogDescription>
            Adicione um cartão para recargas mais rápidas e renovação automática.
          </DialogDescription>
        </DialogHeader>
        
        <Elements stripe={stripePromise}>
          <CardForm onSuccess={onSuccess} />
        </Elements>
      </DialogContent>
    </Dialog>
  );
}
