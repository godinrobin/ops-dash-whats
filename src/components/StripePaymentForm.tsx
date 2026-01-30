import { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, CheckCircle2 } from "lucide-react";

interface StripePaymentFormProps {
  amount: number;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function StripePaymentForm({ amount, onSuccess, onError }: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [elementReady, setElementReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: 'https://zapdata.co/?payment=success',
        },
      });

      if (error) {
        console.error("Payment error:", error);
        onError(error.message || "Erro ao processar pagamento");
      } else if (paymentIntent?.status === 'succeeded') {
        setPaymentSuccess(true);
        // Small delay to show success animation
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else if (paymentIntent?.status === 'processing') {
        onError("O pagamento está sendo processado. Aguarde alguns instantes.");
      } else {
        onError("Status do pagamento inesperado. Por favor, tente novamente.");
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      onError(err.message || "Erro ao processar pagamento");
    } finally {
      setLoading(false);
    }
  };

  if (paymentSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <div className="relative">
          <CheckCircle2 className="h-16 w-16 text-accent animate-in zoom-in-50 duration-300" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-accent">Pagamento Aprovado!</h3>
          <p className="text-sm text-muted-foreground">
            R$ {amount.toFixed(2)} foram adicionados ao seu saldo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!elementReady && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      )}
      
      <div className={`rounded-lg border border-border p-4 bg-card ${!elementReady ? 'hidden' : ''}`}>
        <PaymentElement 
          onReady={() => setElementReady(true)}
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {elementReady && (
        <>
          <Button
            type="submit"
            disabled={!stripe || loading}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Pagar R$ {amount.toFixed(2)}
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Pagamento seguro processado pela <strong>Stripe</strong>
          </p>
        </>
      )}
    </form>
  );
}
