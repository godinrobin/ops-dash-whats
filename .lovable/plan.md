

## Plano: Corrigir Créditos Comprados Erroneamente

### Resumo do Problema Identificado

Os dados mostram que múltiplos usuários realizaram compras de créditos sem que o valor correspondente fosse descontado da carteira. A função `purchase_credits` criada anteriormente protege **compras futuras**, mas os dados incorretos do passado ainda estão no banco.

**Usuários afetados:**
- `otaviozamarrenho@gmail.com`: 8 compras de pacote profissional (1.600 créditos com bônus), saldo de carteira ainda R$500
- `lucasgyn65@gmail.com`: 6 compras em 3 minutos (200 créditos)
- `thiagopradodealmeida@hotmail.com`: 3 compras consecutivas (60 créditos)
- `admin@metricas.local`: 2 compras duplicadas recentes

---

### Etapas de Implementação

**1. Migração SQL para Limpar Dados Incorretos**

Criar uma migração que:

a) **Identifica transações duplicadas/fraudulentas**
   - Transações do tipo "purchase" com menos de 60 segundos de diferença para o mesmo pacote e usuário serão consideradas duplicatas
   - Apenas a primeira transação legítima será mantida

b) **Remove as transações duplicadas**
   - Deleta da tabela `credit_transactions` todas as entradas identificadas como duplicatas

c) **Recalcula o saldo de créditos (`user_credits`)**
   - Para cada usuário afetado, recalcula o `balance` baseado na soma de todas as transações restantes válidas

**2. Script SQL da Limpeza**

```sql
-- 1. Criar tabela temporária com IDs a manter (primeira transação de cada grupo)
WITH ranked_purchases AS (
  SELECT 
    id,
    user_id,
    description,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, description, DATE_TRUNC('minute', created_at)
      ORDER BY created_at ASC
    ) as rn
  FROM credit_transactions
  WHERE type = 'purchase'
),
duplicates_to_delete AS (
  SELECT id FROM ranked_purchases WHERE rn > 1
)
-- 2. Deletar duplicatas
DELETE FROM credit_transactions
WHERE id IN (SELECT id FROM duplicates_to_delete);

-- 3. Recalcular saldos de créditos baseado nas transações restantes
UPDATE user_credits uc
SET balance = (
  SELECT COALESCE(SUM(amount), 0)
  FROM credit_transactions ct
  WHERE ct.user_id = uc.user_id
),
updated_at = now();
```

---

### Resultado Esperado

| Usuário | Créditos Antes | Créditos Depois (Estimado) |
|---------|----------------|---------------------------|
| otaviozamarrenho@gmail.com | 1.632 | ~400-600 (depende de uso legítimo) |
| lucasgyn65@gmail.com | 200 | ~60-80 |
| thiagopradodealmeida@hotmail.com | 60 | ~20 |

---

### Seção Técnica

**Critérios de identificação de duplicatas:**
- Mesmo `user_id`
- Mesma `description` (nome do pacote)
- Diferença de menos de 1 minuto (`DATE_TRUNC('minute', created_at)`)
- Mantém apenas a primeira transação (ordenada por `created_at ASC`)

**Proteção para futuras compras:**
- A função RPC `purchase_credits` já implementada usa `FOR UPDATE` para lock de linha, garantindo atomicidade
- Futuras compras já estão protegidas contra race conditions

**Tabelas afetadas:**
- `credit_transactions` (remoção de registros duplicados)
- `user_credits` (recálculo de saldo baseado nas transações válidas)

