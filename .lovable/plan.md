
# Plano de Correção: Instâncias Gratuitas não Reconhecidas

## Problema Identificado

O usuário `vagner.pointview@gmail.com` é Membro Completo e deveria ter suas 3 instâncias gratuitas, mas a instância `blibia` está sendo cobrada porque existe uma **subscription órfã** no banco de dados.

### Dados no Banco:

| Subscription | Instância | is_free | Problema |
|--------------|-----------|---------|----------|
| `bdd5784d...` | `c60fe102...` | true | **ÓRFÃ - instância excluída!** |
| `2c2b32b6...` | `clareador...` | true | OK |
| `032c576d...` | `calcinha` | true | OK |
| `b0347fb9...` | `blibia` | **false** | DEVERIA SER TRUE |

A subscription órfã ocupa o "slot 1" de gratuidade, empurrando `blibia` para a posição 4.

---

## Plano de Correção

### 1. Correção Imediata - Limpar Dados Deste Usuário

**SQL para corrigir:**
```sql
-- 1. Remover subscription órfã (instância não existe mais)
DELETE FROM instance_subscriptions 
WHERE instance_id = 'c60fe102-2b03-42a6-a870-f750212571ce';

-- 2. Corrigir a subscription da 'blibia' para gratuita (é a 3ª real)
UPDATE instance_subscriptions 
SET is_free = true, expires_at = null
WHERE instance_id = 'f596326e-a04c-4fbd-8f7e-5b98b1ccc7ae';
```

### 2. Correção Sistêmica - Limpar TODAS as Subscriptions Órfãs

Podem existir outros usuários com o mesmo problema:

```sql
-- Remover todas as subscriptions que apontam para instâncias que não existem
DELETE FROM instance_subscriptions ins
WHERE NOT EXISTS (
  SELECT 1 FROM maturador_instances mi 
  WHERE mi.id = ins.instance_id
);
```

### 3. Recalcular Gratuidade para Todos os Usuários Afetados

Após a limpeza, recalcular quais instâncias deveriam ser gratuitas:

```sql
-- Para cada usuário com is_full_member, as 3 primeiras instâncias 
-- (por ordem de criação) devem ser is_free = true
WITH ranked_subscriptions AS (
  SELECT 
    ins.id,
    ins.user_id,
    ins.instance_id,
    p.is_full_member,
    ROW_NUMBER() OVER (PARTITION BY ins.user_id ORDER BY ins.created_at) as position
  FROM instance_subscriptions ins
  JOIN profiles p ON ins.user_id = p.id
  WHERE p.is_full_member = true
)
UPDATE instance_subscriptions ins
SET 
  is_free = (rs.position <= 3),
  expires_at = CASE WHEN rs.position <= 3 THEN null ELSE ins.expires_at END
FROM ranked_subscriptions rs
WHERE ins.id = rs.id;
```

### 4. Prevenção - Adicionar CASCADE DELETE

Para evitar futuras subscriptions órfãs, adicionar uma FOREIGN KEY com CASCADE:

```sql
-- Garantir que subscriptions são deletadas quando a instância é removida
ALTER TABLE instance_subscriptions
ADD CONSTRAINT fk_instance_subscriptions_maturador_instances
FOREIGN KEY (instance_id) REFERENCES maturador_instances(id) ON DELETE CASCADE;
```

**Nota:** Isso requer primeiro remover as órfãs, pois a FK falharia com referências inválidas.

---

## Resumo das Alterações

| Componente | Alteração |
|------------|-----------|
| Dados (imediato) | Deletar subscription órfã do usuário + corrigir `blibia` |
| Dados (global) | Limpar todas as subscriptions órfãs do sistema |
| Dados (recálculo) | Recalcular is_free para membros completos |
| Schema | Adicionar FK com CASCADE para prevenção futura |

---

## Resultado Esperado

Após a correção, as instâncias do usuário ficarão:

| Posição | Instância | is_free | Expires |
|---------|-----------|---------|---------|
| 1º | `clareador` | ✅ true | null |
| 2º | `calcinha` | ✅ true | null |
| 3º | `blibia` | ✅ true | null |

Todas as 3 instâncias serão reconhecidas como gratuitas conforme esperado para um Membro Completo.
