
# Plano: Sistema de Expiração Inicial de 3 Dias para Instâncias

## Resumo

Ajustar o sistema de créditos para que instâncias extras (4ª em diante) comecem com prazo de **3 dias** quando o sistema é ativado. Após o usuário renovar pagando 6 créditos, a instância passa a ter **30 dias** de validade.

---

## 1. Contexto Atual

### Como funciona hoje:
- Instâncias extras recebem `expires_at` = **30 dias** a partir da criação
- O campo `last_renewal` é `null` até a primeira renovação manual
- A coluna "Renovação" no Admin está funcional e mostra os dias corretamente

### Dados no banco:
- Instâncias gratuitas: `is_free = true`, `expires_at = null`
- Instâncias pagas: `is_free = false`, `expires_at = +30 dias`

---

## 2. Alterações Necessárias

### 2.1 Hook `useInstanceSubscription.ts`

**Constantes:**
```text
INITIAL_DAYS = 3         (prazo inicial para instâncias extras)
DAYS_PER_RENEWAL = 30    (prazo após renovação)
```

**Função `registerInstance`:**
- Alterar de 30 dias para **3 dias** ao criar instância paga
- Garantir que `last_renewal = null` (nunca foi renovada)

**Função `renewInstance`:**
- Verificar se `last_renewal === null` (primeira renovação)
- Se for primeira renovação: adicionar 30 dias a partir de AGORA
- Se não for primeira: adicionar 30 dias a partir da data atual de expiração (comportamento existente)

### 2.2 Edge Function `process-instance-renewals`

Nenhuma alteração necessária - já busca instâncias expiradas corretamente.

### 2.3 Admin Panel `AdminInstances.tsx`

Já está funcional - a coluna "Renovação" exibe:
- "Grátis" para instâncias gratuitas
- "X dias" calculados a partir de `expires_at`
- Badge vermelho quando dias <= 3

---

## 3. Migração de Dados

Para instâncias pagas **já existentes** que ainda não foram renovadas (`last_renewal = null`), precisamos:

1. Atualizar `expires_at` para 3 dias a partir de AGORA (ou da data de ativação do sistema)
2. Manter `last_renewal = null` para identificar que nunca foram renovadas

```text
UPDATE instance_subscriptions
SET expires_at = NOW() + INTERVAL '3 days'
WHERE is_free = false 
  AND last_renewal IS NULL;
```

---

## 4. Fluxo Completo

```text
┌─────────────────────────────────────────────────────────────────┐
│                    CICLO DE VIDA DA INSTÂNCIA                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CRIAÇÃO (ou ativação do sistema)                               │
│  ├── É uma das 3 primeiras? ──> is_free=true, expires_at=null  │
│  └── É 4ª+ instância? ──> is_free=false, expires_at=+3 dias    │
│                                                                 │
│  APÓS 3 DIAS (se não renovar)                                   │
│  └── Edge Function deleta instância automaticamente             │
│                                                                 │
│  RENOVAÇÃO (pagar 6 créditos)                                   │
│  ├── Primeira renovação? ──> expires_at = NOW + 30 dias        │
│  └── Renovações seguintes? ──> expires_at += 30 dias           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useInstanceSubscription.ts` | Adicionar constante `INITIAL_DAYS = 3`, alterar `registerInstance` para usar 3 dias |
| Migration SQL | Atualizar instâncias pagas existentes com `last_renewal = null` para 3 dias |

---

## 6. Detalhes Técnicos

### Alteração no `registerInstance`:

```typescript
const INITIAL_DAYS = 3; // Novo
const DAYS_PER_RENEWAL = 30;

// Na função registerInstance:
if (!shouldBeFree && isActive) {
  // Instância paga: expira em 3 dias inicialmente
  expiresAt = new Date(Date.now() + INITIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
```

### Alteração no `renewInstance`:

```typescript
// Na função renewInstance:
const subscription = subscriptions.find(s => s.instance_id === instanceId);
let newExpiration: Date;

// Se nunca foi renovada (primeira renovação), começar do AGORA
const isFirstRenewal = !subscription?.last_renewal;

if (subscription?.expires_at && !isFirstRenewal) {
  const currentExpiration = new Date(subscription.expires_at);
  const now = new Date();
  if (currentExpiration > now) {
    newExpiration = new Date(currentExpiration.getTime() + DAYS_PER_RENEWAL * 24 * 60 * 60 * 1000);
  } else {
    newExpiration = new Date(now.getTime() + DAYS_PER_RENEWAL * 24 * 60 * 60 * 1000);
  }
} else {
  // Primeira renovação: sempre 30 dias a partir de agora
  newExpiration = new Date(Date.now() + DAYS_PER_RENEWAL * 24 * 60 * 60 * 1000);
}
```

### Migration SQL:

```sql
-- Atualizar instâncias pagas existentes que nunca foram renovadas
UPDATE instance_subscriptions
SET expires_at = NOW() + INTERVAL '3 days'
WHERE is_free = false 
  AND last_renewal IS NULL
  AND expires_at IS NOT NULL;
```

---

## 7. Verificação da Coluna Admin

A coluna "Renovação" no AdminInstances já está implementada corretamente:

- Busca dados de `instance_subscriptions` via `getRenewalInfo()`
- Calcula dias restantes: `expiresAt - NOW()`
- Exibe Badge vermelho para <= 3 dias
- Exibe "Grátis" para `is_free = true`

Após a implementação, a coluna mostrará automaticamente "3 dias" para instâncias novas e os valores corretos após renovação.
