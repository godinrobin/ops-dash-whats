

# Plano: Melhorar Exibição do Histórico de Eventos Facebook

## Diagnóstico

Os **100 eventos foram enviados e salvos com sucesso** no banco de dados. O problema está na interface: o componente `ContactDetails.tsx` limita a exibição a apenas **10 eventos** mais recentes (`.limit(10)` na linha 102).

## Solução Proposta

Aumentar o limite de exibição e mostrar um contador indicando o total de eventos enviados para este contato.

## Alterações

### 1. Arquivo: `src/components/inbox/ContactDetails.tsx`

**Modificações:**

1. **Aumentar o limite de eventos exibidos**
   - Alterar `.limit(10)` para `.limit(100)` na função `loadEventLogs`

2. **Adicionar contador total de eventos**
   - Mostrar no cabeçalho do histórico: "Histórico de Eventos (100)"
   - Isso dará visibilidade imediata de quantos eventos foram enviados

3. **Melhorar a área de scroll**
   - Aumentar `max-h-60` para `max-h-80` para comportar mais eventos visíveis

## Detalhes Técnicos

```text
Arquivo: src/components/inbox/ContactDetails.tsx

Linha 102: .limit(10)  →  .limit(100)

Linha 419: Adicionar badge com contagem total
           "Histórico de Eventos" → "Histórico de Eventos ({eventLogs.length})"

Linha 448: max-h-60  →  max-h-80
```

## Resultado Esperado

- Todos os 100 eventos aparecerão no histórico
- O usuário verá um contador mostrando quantos eventos estão listados
- Área de scroll maior para melhor navegação

