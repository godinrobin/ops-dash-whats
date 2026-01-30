

# Plano: Salvar Cartão Automaticamente Após Compra

## Resumo

Quando o usuário faz uma compra com cartão, o sistema atualmente **não salva o cartão automaticamente**. Vou implementar o salvamento automático para que nas próximas compras o cartão já apareça cadastrado.

## O Que Será Feito

### 1. Modificar a Edge Function `stripe-card-payment`
- Adicionar `setup_future_usage: 'off_session'` ao criar o PaymentIntent
- Isso indica ao Stripe que o cartão poderá ser cobrado novamente no futuro

### 2. Modificar o Modal de Pagamento (`CardRechargeModal.tsx`)
Após o pagamento ser bem-sucedido:
- Obter o `payment_method` do PaymentIntent
- Chamar `manage-payment-methods` com ação `save-payment-method`
- Salvar automaticamente o cartão no banco de dados

### 3. Fluxo Atualizado

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE PAGAMENTO                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Usuário insere dados do cartão                               │
│ 2. stripe.confirmCardPayment() → Pagamento processado           │
│ 3. PaymentIntent retorna payment_method_id                      │
│ 4. [NOVO] Chamar manage-payment-methods/save-payment-method     │
│ 5. Cartão salvo automaticamente para uso futuro                 │
└─────────────────────────────────────────────────────────────────┘
```

## Detalhes Técnicos

### Edge Function `stripe-card-payment/index.ts`
```typescript
const paymentIntent = await stripe.paymentIntents.create({
  amount: amountInCentavos,
  currency: 'brl',
  customer: customerId,
  payment_method_types: ['card'],
  setup_future_usage: 'off_session', // <-- ADICIONAR
  metadata: { ... }
});
```

### Frontend `CardRechargeModal.tsx` (handleSubmit)
Após `paymentIntent.status === 'succeeded'`:
```typescript
// Obter o payment_method do PaymentIntent
if (paymentIntent.payment_method) {
  const paymentMethodId = typeof paymentIntent.payment_method === 'string' 
    ? paymentIntent.payment_method 
    : paymentIntent.payment_method.id;
    
  // Salvar cartão automaticamente
  await supabase.functions.invoke('manage-payment-methods', {
    body: { 
      action: 'save-payment-method', 
      paymentMethodId 
    },
  });
}
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/stripe-card-payment/index.ts` | Adicionar `setup_future_usage: 'off_session'` |
| `src/components/CardRechargeModal.tsx` | Salvar cartão automaticamente após sucesso |

## Resultado Esperado

1. Usuário faz primeira compra → Cartão é salvo automaticamente
2. Na próxima compra → Cartão aparece na lista para seleção rápida
3. Renovação automática → Sistema usa cartão salvo

