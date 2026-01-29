
# Plano: Corrigir Exibição de Dias Restantes das Instâncias

## Diagnóstico do Problema

O contador de "dias restantes" está usando `Math.ceil()` que arredonda frações para cima. Isso causa confusão porque:

- **27/01**: 3.9 dias → exibe "4 dias"
- **28/01**: 2.9 dias → exibe "3 dias"  
- **29/01**: 2.1 dias → exibe "3 dias" ⚠️

O usuário vê "3 dias" por dois dias consecutivos, parecendo que o contador travou.

## Solução Proposta

### 1. Alterar lógica de cálculo de dias

Trocar `Math.ceil()` por `Math.floor()` para mostrar dias **completos** restantes:

- 2.9 dias → "2 dias"
- 2.1 dias → "2 dias"
- 1.9 dias → "1 dia"
- 0.9 dias → "Expira hoje"

Isso é mais intuitivo pois mostra quantos dias **cheios** faltam.

### 2. Melhorar precisão para casos críticos

Para instâncias com menos de 1 dia, mostrar "Expira hoje" ou "Expira em X horas" quando apropriado.

---

## Detalhes Técnicos

### Arquivo: `src/hooks/useInstanceSubscription.ts`

Alterar nas linhas 196-199, 206-211 e 223-228:

```typescript
// ANTES:
if (diff <= 0) return 0;
return Math.ceil(diff / (1000 * 60 * 60 * 24));

// DEPOIS:
if (diff <= 0) return 0;
const days = diff / (1000 * 60 * 60 * 24);
if (days < 1) return 0; // Menos de 24h = "Expira hoje"
return Math.floor(days); // Dias completos restantes
```

### Arquivo: `src/components/credits/InstanceRenewalTag.tsx`

Atualizar `getBadgeContent()` para lidar melhor com o caso de 0 dias:

```typescript
const getBadgeContent = () => {
  if (daysRemaining === 0) return 'Expira hoje!';
  if (daysRemaining === 1) return '1 dia';
  if (daysRemaining !== null) return `${daysRemaining} dias`;
  return null;
};
// Esta parte já está correta, apenas manter consistente
```

---

## Impacto Esperado

| Situação | Antes | Depois |
|----------|-------|--------|
| 2.9 dias | "3 dias" | "2 dias" |
| 2.1 dias | "3 dias" | "2 dias" |
| 1.5 dias | "2 dias" | "1 dia" |
| 0.5 dias | "1 dia" | "Expira hoje" |

O contador agora diminuirá **exatamente uma vez por dia**, às 13:17h (horário da expiração), evitando confusão do usuário.

---

## Verificação de Dados no Banco

As datas de expiração no banco estão corretas:
- Todas as instâncias pagas expiram em **31/01/2026 13:17:37**
- Isso foi definido pela migration de 27/01 que aplicou `NOW() + 3 days`
- Nenhuma correção de dados é necessária

---

## Resumo das Alterações

1. **useInstanceSubscription.ts**: Trocar `Math.ceil` por `Math.floor` com tratamento especial para < 24h
2. **InstanceRenewalTag.tsx**: Verificar que "Expira hoje" está funcionando para `daysRemaining === 0`
