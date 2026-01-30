
# Plano: Checkout Interno com Stripe Elements

## Visão Geral

Implementar um formulário de pagamento embutido dentro do modal atual, usando o **Stripe Elements (PaymentElement)**. O usuário digitará os dados do cartão diretamente na plataforma e clicará em "Pagar" sem sair do ZapData.

## Fluxo do Usuário

```text
┌─────────────────────────────────────────────────────────────────┐
│  1. Usuário escolhe valor (R$ 10, R$ 50, etc.)                  │
│                          ↓                                       │
│  2. Clica em "Continuar para Pagamento"                         │
│                          ↓                                       │
│  3. Backend cria PaymentIntent e retorna client_secret          │
│                          ↓                                       │
│  4. Stripe Elements renderiza formulário de cartão no modal     │
│                          ↓                                       │
│  5. Usuário digita dados do cartão e clica "Pagar R$ XX,XX"     │
│                          ↓                                       │
│  6. Pagamento confirmado sem redirecionamento                   │
│                          ↓                                       │
│  7. Saldo é creditado via webhook e modal fecha com sucesso     │
└─────────────────────────────────────────────────────────────────┘
```

## Mudanças Necessárias

### 1. Adicionar Secret da Publishable Key

O Stripe Elements precisa da **chave pública** (publishable key) no frontend para renderizar o formulário de forma segura.

**Ação:** Adicionar o secret `VITE_STRIPE_PUBLISHABLE_KEY` no projeto.

### 2. Instalar Dependência do Stripe

Adicionar o pacote `@stripe/react-stripe-js` e `@stripe/stripe-js` para usar os componentes React do Stripe.

```bash
npm install @stripe/react-stripe-js @stripe/stripe-js
```

### 3. Nova Edge Function: `stripe-create-payment-intent`

Criar uma function que gera um **PaymentIntent** (ao invés de Checkout Session) e retorna o `client_secret` para o frontend.

```typescript
// supabase/functions/stripe-create-payment-intent/index.ts

// 1. Autenticar usuário
// 2. Validar valor (R$ 5 - R$ 5.000)
// 3. Buscar/criar Stripe Customer
// 4. Criar PaymentIntent com metadata (user_id, amount, type)
// 5. Retornar { clientSecret, paymentIntentId }
```

### 4. Atualizar `CardRechargeModal.tsx`

Refatorar o modal para ter duas etapas:

**Etapa 1 - Seleção de Valor:**
- Interface atual de seleção de valores
- Botão "Continuar para Pagamento"

**Etapa 2 - Formulário de Cartão:**
- Stripe `<Elements>` wrapper com o `clientSecret`
- Stripe `<PaymentElement>` para captura dos dados
- Botão "Pagar R$ XX,XX"
- Processamento sem redirecionamento usando `redirect: 'if_required'`

### 5. Criar Componente `StripePaymentForm.tsx`

Componente isolado que encapsula a lógica do Stripe Elements:

```tsx
// src/components/StripePaymentForm.tsx

import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Renderiza o PaymentElement
// Trata o submit com stripe.confirmPayment({ redirect: 'if_required' })
// Mostra estados de loading e erro
// Callback onSuccess quando pagamento completar
```

### 6. Atualizar Webhook Existente

O webhook `stripe-wallet-webhook` já processa `payment_intent.succeeded`, então funcionará automaticamente para creditar o saldo após o pagamento interno.

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `package.json` | Adicionar `@stripe/react-stripe-js` e `@stripe/stripe-js` |
| `supabase/functions/stripe-create-payment-intent/index.ts` | **Criar** - Nova function para PaymentIntent |
| `src/components/StripePaymentForm.tsx` | **Criar** - Componente do formulário Stripe |
| `src/components/CardRechargeModal.tsx` | **Modificar** - Integrar Stripe Elements em 2 etapas |

## Detalhes Técnicos

### Configuração do Stripe Elements

```tsx
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Wrapper com tema escuro para combinar com o modal
<Elements 
  stripe={stripePromise} 
  options={{
    clientSecret,
    appearance: {
      theme: 'night',
      variables: {
        colorPrimary: '#f97316', // accent color (laranja)
      }
    }
  }}
>
  <StripePaymentForm amount={amount} onSuccess={handleSuccess} />
</Elements>
```

### Confirmação sem Redirecionamento

```typescript
const { error, paymentIntent } = await stripe.confirmPayment({
  elements,
  redirect: 'if_required', // Evita redirecionamento
  confirmParams: {
    return_url: 'https://zapdata.co/?payment=success', // Fallback se necessário
  },
});

if (!error && paymentIntent?.status === 'succeeded') {
  // Pagamento concluído! Fechar modal e mostrar sucesso
}
```

### Edge Function: stripe-create-payment-intent

```typescript
const paymentIntent = await stripe.paymentIntents.create({
  amount: amountInCentavos,
  currency: 'brl',
  customer: customerId,
  metadata: {
    user_id: user.id,
    amount: amount.toString(),
    type: 'wallet_recharge',
  },
  automatic_payment_methods: {
    enabled: true,
  },
});

return { clientSecret: paymentIntent.client_secret };
```

## Vantagens da Implementação

1. **Experiência integrada** - Usuário não sai da plataforma
2. **Mais rápido** - Sem carregamento de página externa
3. **Consistência visual** - Formulário estilizado com as cores do ZapData
4. **Segurança mantida** - Stripe Elements é PCI compliant
5. **Webhook reutilizado** - O webhook existente já processa o pagamento

## Pré-requisitos

Antes de implementar, será necessário:

1. **Obter a Publishable Key** do Stripe Dashboard
2. **Adicionar o secret** `VITE_STRIPE_PUBLISHABLE_KEY` no projeto

Posso prosseguir com a implementação após sua aprovação.
