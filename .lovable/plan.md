

# Plano de Correção: Fluxo Travado por Edge Auto-Referenciada

## Diagnóstico Completo

### Problema Identificado
O fluxo do lead **João Lucas (553198284929)** está travado porque existe uma **edge auto-referenciada** no nó `text-1769483930242` ("*Agora eu conto com a sua honestidade...*").

**Edge problemática no banco:**
```
source: text-1769483930242 → target: text-1769483930242 (loop infinito)
```

**Edge correta existe mas é ignorada:**
```
source: text-1769483930242 → target: delay-1769485090627 (próximo passo correto)
```

### Por que o fluxo travou?
1. O nó de texto foi enviado corretamente
2. Ao buscar a próxima edge, o código usa `edges.find()` que retorna a **primeira match**
3. A edge auto-referenciada aparece primeiro no array
4. O sistema entra em loop infinito tentando reprocessar o mesmo nó
5. A Edge Function atinge timeout (~30s) e retorna erro 546

### Evidências
- Session ID: `7b97eb1a-a070-4163-ab05-bb426a5a1bfb`
- Status: `active` com `processing: true` (travado)
- `current_node_id`: `text-1769483350268` (nó anterior ao problemático)
- `_sent_node_ids` inclui `text-1769483930242` (mensagem já enviada)
- Erro 546 repetido nos logs de `process-delay-queue`

---

## Plano de Correção

### 1. Correção de Dados Imediata
Remover a edge auto-referenciada do fluxo BIBLICO e destravar a sessão.

**SQL para corrigir:**
```sql
-- 1. Remover edge auto-referenciada do fluxo
UPDATE inbox_flows
SET edges = (
  SELECT jsonb_agg(edge)
  FROM jsonb_array_elements(edges::jsonb) AS edge
  WHERE NOT (
    edge->>'source' = 'text-1769483930242' 
    AND edge->>'target' = 'text-1769483930242'
  )
)
WHERE id = 'daba8a73-ed09-4d03-b23f-64fdd6022503';

-- 2. Destravar a sessão e avançar para o delay correto
UPDATE inbox_flow_sessions
SET 
  processing = false,
  processing_started_at = null,
  current_node_id = 'delay-1769485090627'
WHERE id = '7b97eb1a-a070-4163-ab05-bb426a5a1bfb';
```

### 2. Correção de Código para Prevenir Loops
Modificar a lógica no `process-inbox-flow` para **ignorar edges auto-referenciadas**:

**Arquivo:** `supabase/functions/process-inbox-flow/index.ts`

**Alteração:** Em todos os pontos onde fazemos `edges.find(e => e.source === currentNodeId)`, adicionar filtro para evitar auto-referência:

```typescript
// ANTES (problemático)
const textEdge = edges.find(e => e.source === currentNodeId);

// DEPOIS (seguro)
const textEdge = edges.find(e => 
  e.source === currentNodeId && e.target !== currentNodeId
);
```

**Pontos a alterar:**
- Linha 1023 (case 'text' - idempotency skip)
- Linha 1078 (case 'text' - normal flow)
- Linha 1132 (case 'aiText' - idempotency skip)
- Linha 1146 (case 'aiText' - empty skip)
- E todos os outros casos de nós similares

### 3. Validação no Frontend (FlowBuilder)
Adicionar validação para **prevenir criação de edges auto-referenciadas** quando o usuário conecta nós:

**Arquivo:** `src/components/flow-builder/FlowCanvas.tsx`

```typescript
// No handler onConnect, adicionar validação:
const onConnect = useCallback((params) => {
  // Prevenir edge auto-referenciada
  if (params.source === params.target) {
    toast.error('Não é possível conectar um nó a ele mesmo');
    return;
  }
  // ... resto do código
}, [...]);
```

---

## Resumo das Alterações

| Componente | Alteração |
|------------|-----------|
| Banco de Dados | Remover edge problemática do fluxo + destravar sessão |
| `process-inbox-flow` | Filtrar edges auto-referenciadas em todas as transições |
| `FlowCanvas.tsx` | Bloquear criação de edges auto-referenciadas na UI |

---

## Seção Técnica

### Edge Functions Afetadas
- `supabase/functions/process-inbox-flow/index.ts` - Precisa filtrar self-loops em ~15-20 lugares

### Helper Function Proposta
Para evitar repetição, criar um helper:
```typescript
const findNextEdge = (nodeId: string, sourceHandle?: string) => {
  return edges.find(e => 
    e.source === nodeId && 
    e.target !== nodeId && // Previne self-loop
    (sourceHandle === undefined || e.sourceHandle === sourceHandle)
  );
};
```

### Fluxo do Lead Após Correção
```text
[já enviado] text-1769483930242 ("Agora eu conto com a sua honestidade...")
       │
       ▼
[próximo]    delay-1769485090627 (aguardar 10s)
       │
       ▼
             text-1769483963906 ("Escolha um valor para contribuir...")
       │
       ▼
             sendPixKey-1769484005943 (enviar chave PIX)
       │
       ▼
             paymentIdentifier (aguardar confirmação)
```

