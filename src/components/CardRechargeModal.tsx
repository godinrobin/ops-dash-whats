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
import { Loader2, CreditCard, ArrowLeft, CheckCircle2, Lock } from "lucide-react";
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
import { FlippableCreditCard } from "@/components/ui/credit-debit-card";

interface CardRechargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
}

const PRESET_VALUES_ROW1 = [10, 20, 50, 100, 200];
const PRESET_VALUES_ROW2 = [500, 800, 1000, 2000, 5000];

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

type Step = 'select-amount' | 'card-form';

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

// Format card number for display (masked with last 4 visible)
function formatCardNumberDisplay(length: number, last4?: string): string {
  if (length === 0) return "•••• •••• •••• ••••";
  
  // Create masked display based on digits entered
  const maskedPart = "*".repeat(Math.min(length, 12));
  const visiblePart = last4 || "****";
  
  // Format with spaces
  const fullNumber = maskedPart.padEnd(12, "*") + visiblePart;
  return fullNumber.replace(/(.{4})/g, '$1 ').trim();
}

// Card Form Component
function CardForm({ 
  amount, 
  onSuccess, 
  onBack 
}: { 
  amount: number; 
  onSuccess: () => void; 
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  
  // Card display state - simulated values for visual feedback
  const [cardNumberLength, setCardNumberLength] = useState(0);
  const [cardComplete, setCardComplete] = useState(false);
  const [displayCardNumber, setDisplayCardNumber] = useState("•••• •••• •••• ••••");
  const [displayExpiry, setDisplayExpiry] = useState("••/••");
  const [displayCvv, setDisplayCvv] = useState("•••");
  const [cvvLength, setCvvLength] = useState(0);
  const [expiryTyping, setExpiryTyping] = useState(false);

  // Custom input fields for visual display (Stripe handles actual payment)
  const [inputCardNumber, setInputCardNumber] = useState("");
  const [inputExpiry, setInputExpiry] = useState("");
  const [inputCvv, setInputCvv] = useState("");

  // Format and mask card number input
  const handleCardNumberInput = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '').slice(0, 16);
    
    // Format with spaces
    const formatted = digits.replace(/(.{4})/g, '$1 ').trim();
    setInputCardNumber(formatted);
    
    // Update display on card (masked except last 4)
    if (digits.length === 0) {
      setDisplayCardNumber("•••• •••• •••• ••••");
    } else if (digits.length <= 4) {
      const masked = "*".repeat(digits.length);
      setDisplayCardNumber(masked.padEnd(16, "•").replace(/(.{4})/g, '$1 ').trim());
    } else {
      const masked = "*".repeat(digits.length - 4) + digits.slice(-4);
      setDisplayCardNumber(masked.padEnd(16, "•").replace(/(.{4})/g, '$1 ').trim());
    }
  };

  // Format expiry input
  const handleExpiryInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    
    let formatted = digits;
    if (digits.length >= 2) {
      formatted = digits.slice(0, 2) + ' / ' + digits.slice(2);
    }
    setInputExpiry(formatted);
    
    // Update display
    if (digits.length === 0) {
      setDisplayExpiry("••/••");
    } else if (digits.length <= 2) {
      setDisplayExpiry(digits.padEnd(2, "•") + "/••");
    } else {
      setDisplayExpiry(digits.slice(0, 2) + "/" + digits.slice(2).padEnd(2, "•"));
    }
  };

  // Format CVV input (all masked)
  const handleCvvInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setInputCvv(digits);
    
    // Update display (all asterisks)
    if (digits.length === 0) {
      setDisplayCvv("•••");
    } else {
      setDisplayCvv("*".repeat(digits.length));
    }
  };

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
      // 1. Create PaymentIntent on backend
      const { data, error } = await supabase.functions.invoke('stripe-card-payment', {
        body: { amount }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const { clientSecret } = data;

      // 2. Confirm payment with card
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardNumberElement,
        },
      });

      if (stripeError) {
        console.error("Stripe error:", stripeError);
        toast({ 
          title: stripeError.message || "Erro ao processar pagamento", 
          variant: "destructive" 
        });
      } else if (paymentIntent?.status === 'succeeded') {
        setPaymentSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        toast({ 
          title: "Status do pagamento inesperado. Tente novamente.", 
          variant: "destructive" 
        });
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      toast({ 
        title: err.message || "Erro ao processar pagamento", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  if (paymentSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <CheckCircle2 className="h-16 w-16 text-accent animate-in zoom-in-50 duration-300" />
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
      <div className="flex items-center gap-2 mb-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">Pagar R$ {amount.toFixed(2)}</span>
      </div>

      {/* Visual Credit Card */}
      <div className="flex justify-center mb-2">
        <FlippableCreditCard
          cardholderName="TITULAR DO CARTÃO"
          cardNumber={displayCardNumber}
          expiryDate={displayExpiry}
          cvv={displayCvv}
          isFlipped={isFlipped}
        />
      </div>

      <div className="space-y-3">
        {/* Card Number - Custom Input + Hidden Stripe Element */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Número do Cartão</label>
          <div className="relative">
            <Input
              type="text"
              placeholder="0000 0000 0000 0000"
              value={inputCardNumber}
              onChange={(e) => handleCardNumberInput(e.target.value)}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 h-11"
              maxLength={19}
            />
            {/* Hidden Stripe Element for actual payment processing */}
            <div className="absolute opacity-0 pointer-events-none">
              <CardNumberElement options={{ style: elementStyle }} />
            </div>
          </div>
        </div>

        {/* Expiry and CVV */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Validade</label>
            <Input
              type="text"
              placeholder="MM / AA"
              value={inputExpiry}
              onChange={(e) => handleExpiryInput(e.target.value)}
              onFocus={() => setIsFlipped(false)}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 h-11"
              maxLength={7}
            />
            {/* Hidden Stripe Element */}
            <div className="absolute opacity-0 pointer-events-none">
              <CardExpiryElement options={{ style: elementStyle }} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">CVV</label>
            <Input
              type="password"
              placeholder="CVC"
              value={inputCvv}
              onChange={(e) => handleCvvInput(e.target.value)}
              onFocus={() => setIsFlipped(true)}
              onBlur={() => setIsFlipped(false)}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 h-11"
              maxLength={4}
            />
            {/* Hidden Stripe Element */}
            <div className="absolute opacity-0 pointer-events-none">
              <CardCvcElement options={{ style: elementStyle }} />
            </div>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={!stripe || loading || inputCardNumber.length < 19 || inputExpiry.length < 7 || inputCvv.length < 3}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 h-11"
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

      <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
        <Lock className="h-3 w-3" />
        Pagamento seguro e criptografado.
      </p>
    </form>
  );
}

export function CardRechargeModal({ open, onOpenChange, onBack }: CardRechargeModalProps) {
  const { toast } = useToast();
  
  const [customAmount, setCustomAmount] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [step, setStep] = useState<Step>('select-amount');

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCustomAmount("");
      setSelectedAmount(null);
      setStep('select-amount');
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

  const handleContinue = () => {
    const amount = getFinalAmount();
    
    if (amount < 5) {
      toast({ title: "Valor mínimo: R$ 5,00", variant: "destructive" });
      return;
    }

    if (amount > 5000) {
      toast({ title: "Valor máximo: R$ 5.000,00", variant: "destructive" });
      return;
    }

    setStep('card-form');
  };

  const handlePaymentSuccess = () => {
    toast({ 
      title: "Pagamento aprovado!",
      description: `R$ ${getFinalAmount().toFixed(2)} foram adicionados ao seu saldo.`
    });
    onOpenChange(false);
  };

  const handleBackToAmount = () => {
    setStep('select-amount');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-2 border-accent">
        {step === 'select-amount' && (
          <>
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
                  Recarga via Cartão
                </DialogTitle>
              </div>
              <DialogDescription>
                Escolha o valor para recarregar
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

              {/* Botão de continuar */}
              <Button
                onClick={handleContinue}
                disabled={getFinalAmount() < 5}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {getFinalAmount() >= 5 
                  ? `Continuar com R$ ${getFinalAmount().toFixed(2)}`
                  : 'Continuar'
                }
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Valor mínimo: R$ 5,00 • Valor máximo: R$ 5.000,00
              </p>
            </div>
          </>
        )}

        {step === 'card-form' && (
          <Elements stripe={stripePromise}>
            <CardForm 
              amount={getFinalAmount()} 
              onSuccess={handlePaymentSuccess}
              onBack={handleBackToAmount}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
