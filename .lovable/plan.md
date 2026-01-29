

# Plano de Correção: Sistema de Cobrança de Instâncias WhatsApp

## Problema Identificado

Após investigação completa, encontrei **2 bugs críticos** que estão permitindo a criação de instâncias sem cobrança:

### Bug 1: Contagem Incorreta de Slots Gratuitos

**Localização:** `src/pages/MaturadorInstances.tsx` (linhas 299-306)

```typescript
// Código atual - PROBLEMÁTICO
const connectedCount = instances.filter(i => 
  i.status === 'connected' || i.status === 'open'
).length;

const hasFreeSlot = effectiveFM && connectedCount < FREE_INSTANCES_LIMIT;
```

**O problema:** O código verifica apenas instâncias **atualmente conectadas**, não o **total de instâncias** (incluindo desconectadas). Isso permite:

1. Usuário cria 3 instâncias gratuitas
2. Desconecta 1 ou mais
3. Cria nova instância → Sistema pensa que ainda tem slots gratuitos
4. Ciclo se repete infinitamente

### Bug 2: `registerInstance()` Não Está Sendo Chamado Corretamente

**Localização:** `src/hooks/useInstanceSubscription.ts` (linha 317)

```typescript
// Usa sortedSubscriptions.length - que pode estar desatualizado
const shouldBeFree = effectiveFM && sortedSubscriptions.length < FREE_INSTANCES_LIMIT;
```

**Evidência:** Verificando o banco de dados:
- 18 instâncias criadas APÓS ativação do sistema (28/01 13:17)
- NENHUMA tem registro em `instance_subscriptions` (subscription_id = null)
- NENHUMA transação de créditos para `instancia_whatsapp`

---

## Plano de Correção

### Fase 1: Corrigir Lógica de Contagem (MaturadorInstances.tsx)

Alterar a verificação para contar **TODAS as instâncias** do usuário (não apenas conectadas), ou usar a tabela `instance_subscriptions` como fonte de verdade:

```typescript
// Opção A: Contar todas as instâncias
const totalInstanceCount = instances.length;
const hasFreeSlot = effectiveFM && totalInstanceCount < FREE_INSTANCES_LIMIT;

// Opção B (mais segura): Usar subscriptions como fonte de verdade
// Isto garante consistência mesmo se instâncias forem criadas por outros meios
const hasFreeSlot = effectiveFM && freeInstancesRemaining > 0;
```

### Fase 2: Corrigir `registerInstance()` (useInstanceSubscription.ts)

O hook precisa:
1. Fazer refresh dos subscriptions ANTES de calcular se é grátis
2. Contar TODAS as subscriptions existentes, não apenas as conectadas
3. Adicionar logging para debug

### Fase 3: Migração de Dados - Criar Registros Faltantes

Criar registros em `instance_subscriptions` para as 18 instâncias criadas sem registro:

```sql
-- Identificar instâncias sem subscription
INSERT INTO instance_subscriptions (instance_id, user_id, is_free, expires_at)
SELECT 
  mi.id,
  mi.user_id,
  -- Determinar se deve ser gratuita baseado na ordem de criação por usuário
  (ROW_NUMBER() OVER (PARTITION BY mi.user_id ORDER BY mi.created_at) <= 3),
  -- Se não for gratuita, expira em 3 dias
  CASE 
    WHEN ROW_NUMBER() OVER (PARTITION BY mi.user_id ORDER BY mi.created_at) > 3 
    THEN NOW() + INTERVAL '3 days'
    ELSE NULL 
  END
FROM maturador_instances mi
LEFT JOIN instance_subscriptions ins ON mi.id = ins.instance_id
WHERE ins.id IS NULL
  AND mi.created_at > '2026-01-28 13:17:37+00'
ON CONFLICT (instance_id) DO NOTHING;
```

---

## Detalhes Técnicos

### Arquivos a Modificar:

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/MaturadorInstances.tsx` | Corrigir lógica de `hasFreeSlot` para usar total de instâncias |
| `src/hooks/useInstanceSubscription.ts` | Garantir que `registerInstance` sempre crie o registro corretamente |
| Migração SQL | Popular `instance_subscriptions` para instâncias órfãs |

### Fluxo Corrigido:

```text
Usuário clica "Criar Instância"
       │
       ▼
Verificar freeInstancesRemaining (do hook)
       │
       ├── > 0 e isFullMember → Criar grátis
       │
       └── == 0 OU !isFullMember
              │
              ▼
        Tem 6 créditos?
              │
              ├── Não → Modal "Créditos Insuficientes"
              │
              └── Sim → Debitar 6 créditos
                         │
                         ▼
                   Criar instância + Registrar subscription
```

---

## Impacto Esperado

- **Novas instâncias:** Serão cobradas corretamente
- **Instâncias existentes (18):** Receberão registros de subscription com expiração em 3 dias (forçando renovação)
- **Membros completos:** Manterão suas 3 primeiras instâncias gratuitas, as demais cobradas

