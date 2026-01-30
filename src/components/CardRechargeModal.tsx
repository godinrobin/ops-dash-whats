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

type Step = 'select-amount' | 'select-method' | 'card-form';

interface SavedCard {
  id: string;
  card_brand: string;
  card_last4: string;
  card_exp_month: number;
  card_exp_year: number;
  is_primary: boolean;
}

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
  const [cardComplete, setCardComplete] = useState(false);
  const [expiryComplete, setExpiryComplete] = useState(false);
  const [cvvComplete, setCvvComplete] = useState(false);
  
  // Card display state
  const [displayCardNumber, setDisplayCardNumber] = useState("•••• •••• •••• ••••");
  const [displayExpiry, setDisplayExpiry] = useState("••/••");
  const [displayCvv, setDisplayCvv] = useState("•••");
  const [displayName, setDisplayName] = useState("");
  const [inputName, setInputName] = useState("");

  // Track card number input for masking
  const [cardNumberTracker, setCardNumberTracker] = useState("");

  // Handle Stripe CardNumber change
  const handleCardNumberChange = (event: any) => {
    setCardComplete(event.complete);
    
    // Stripe doesn't give us the actual value, but we can track length via brand detection
    // We'll use a workaround: track input via a hidden field synced with brand changes
    if (event.empty) {
      setDisplayCardNumber("•••• •••• •••• ••••");
      setCardNumberTracker("");
    } else if (event.complete) {
      // When complete, show masked number with last 4 visible (placeholder approach)
      setDisplayCardNumber("**** **** **** ••••");
    }
  };

  // Handle Stripe Expiry change
  const handleExpiryChange = (event: any) => {
    setExpiryComplete(event.complete);
    if (event.empty) {
      setDisplayExpiry("••/••");
    } else if (event.complete) {
      setDisplayExpiry("••/••");
    }
  };

  // Handle Stripe CVV change
  const handleCvvChange = (event: any) => {
    setCvvComplete(event.complete);
    if (event.empty) {
      setDisplayCvv("•••");
    } else if (event.complete) {
      setDisplayCvv("***");
    }
  };

  // Handle cardholder name input
  const handleNameInput = (value: string) => {
    const cleanName = value.toUpperCase().slice(0, 25);
    setInputName(cleanName);
    setDisplayName(cleanName || "TITULAR DO CARTÃO");
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

      // 2. Confirm payment with card (including cardholder name)
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: {
            name: inputName || undefined,
          },
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
    <form onSubmit={handleSubmit} className="space-y-3">
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
          cardholderName={displayName || "TITULAR DO CARTÃO"}
          cardNumber={displayCardNumber}
          expiryDate={displayExpiry}
          cvv={displayCvv}
          isFlipped={isFlipped}
        />
      </div>

      <div className="space-y-3">
        {/* Cardholder Name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Nome do Titular</label>
          <Input
            type="text"
            placeholder="TITULAR DO CARTÃO"
            value={inputName}
            onChange={(e) => handleNameInput(e.target.value)}
            className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 h-11 uppercase"
            maxLength={25}
          />
        </div>

        {/* Card Number - Stripe Element */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Número do Cartão</label>
          <div className="bg-card border border-border rounded-md px-3 py-3 h-11 flex items-center [&_.StripeElement]:w-full">
            <CardNumberElement 
              options={{ 
                style: elementStyle,
                showIcon: true,
              }} 
              onChange={handleCardNumberChange}
              className="w-full"
            />
          </div>
        </div>

        {/* Expiry and CVV - Stripe Elements */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Validade</label>
            <div className="bg-card border border-border rounded-md px-3 py-3 h-11 flex items-center [&_.StripeElement]:w-full">
              <CardExpiryElement 
                options={{ style: elementStyle }} 
                onChange={handleExpiryChange}
                onFocus={() => setIsFlipped(false)}
                className="w-full"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">CVV</label>
            <div className="bg-card border border-border rounded-md px-3 py-3 h-11 flex items-center [&_.StripeElement]:w-full">
              <CardCvcElement 
                options={{ style: elementStyle }} 
                onChange={handleCvvChange}
                onFocus={() => setIsFlipped(true)}
                onBlur={() => setIsFlipped(false)}
                className="w-full"
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
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SavedCard | null>(null);
  const [chargingCard, setChargingCard] = useState(false);

  // Load saved cards when modal opens
  useEffect(() => {
    if (open) {
      loadSavedCards();
    } else {
      setCustomAmount("");
      setSelectedAmount(null);
      setStep('select-amount');
      setSelectedCard(null);
    }
  }, [open]);

  const loadSavedCards = async () => {
    setLoadingCards(true);
    try {
      const { data } = await supabase.functions.invoke('manage-payment-methods', {
        body: { action: 'list' },
      });
      setSavedCards(data?.methods || []);
    } catch (error) {
      console.error('Error loading saved cards:', error);
    } finally {
      setLoadingCards(false);
    }
  };

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

    // If user has saved cards, show selection screen
    if (savedCards.length > 0) {
      setStep('select-method');
    } else {
      setStep('card-form');
    }
  };

  const handleChargeSavedCard = async () => {
    if (!selectedCard) return;
    
    setChargingCard(true);
    try {
      const { data, error } = await supabase.functions.invoke('charge-saved-card', {
        body: { 
          amount: getFinalAmount(), 
          paymentMethodId: selectedCard.id 
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || 'Erro ao processar pagamento');
      }

      toast({ 
        title: "Pagamento aprovado!",
        description: `R$ ${getFinalAmount().toFixed(2)} foram adicionados ao seu saldo.`
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ 
        title: err.message || "Erro ao cobrar cartão", 
        variant: "destructive" 
      });
    } finally {
      setChargingCard(false);
    }
  };

  const handlePaymentSuccess = () => {
    toast({ 
      title: "Pagamento aprovado!",
      description: `R$ ${getFinalAmount().toFixed(2)} foram adicionados ao seu saldo.`
    });
    loadSavedCards(); // Reload to get newly saved card
    onOpenChange(false);
  };

  const handleBackToAmount = () => {
    setStep('select-amount');
    setSelectedCard(null);
  };

  const handleBackToMethodSelect = () => {
    setStep('select-method');
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

        {step === 'select-method' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBackToAmount}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-accent" />
                  Escolha o Método
                </DialogTitle>
              </div>
              <DialogDescription>
                Pagar R$ {getFinalAmount().toFixed(2)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Saved cards */}
              {savedCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all ${
                    selectedCard?.id === card.id 
                      ? 'border-accent bg-accent/10' 
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">💳</div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{card.card_brand}</span>
                        <span className="text-muted-foreground">****{card.card_last4}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Expira em {card.card_exp_month.toString().padStart(2, '0')}/{card.card_exp_year}
                      </p>
                    </div>
                  </div>
                  {selectedCard?.id === card.id && (
                    <CheckCircle2 className="h-5 w-5 text-accent" />
                  )}
                </button>
              ))}

              {/* New card option */}
              <button
                onClick={() => setStep('card-form')}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-dashed border-border hover:border-accent/50 transition-all"
              >
                <div className="p-2 rounded-full bg-accent/10">
                  <CreditCard className="h-5 w-5 text-accent" />
                </div>
                <span className="font-medium">Usar novo cartão</span>
              </button>

              {/* Pay button */}
              {selectedCard && (
                <Button
                  onClick={handleChargeSavedCard}
                  disabled={chargingCard}
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90 h-11"
                >
                  {chargingCard ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Pagar R$ {getFinalAmount().toFixed(2)}
                    </>
                  )}
                </Button>
              )}

              <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" />
                Pagamento seguro e criptografado.
              </p>
            </div>
          </>
        )}

        {step === 'card-form' && (
          <Elements stripe={stripePromise}>
            <CardForm 
              amount={getFinalAmount()} 
              onSuccess={handlePaymentSuccess}
              onBack={savedCards.length > 0 ? handleBackToMethodSelect : handleBackToAmount}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
