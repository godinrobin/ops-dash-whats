# Plano de Correção: Fluxo Travado por Edge Auto-Referenciada

## ✅ STATUS: CONCLUÍDO

---

## Resumo das Correções Aplicadas

### 1. ✅ Correção de Dados (Banco)
Executado SQL para:
- Remover edge auto-referenciada do fluxo BIBLICO (`text-1769483930242` → `text-1769483930242`)
- Destravar a sessão do lead 553198284929, avançando para `delay-1769485090627`

### 2. ✅ Proteção no Backend (`process-inbox-flow`)
Criados dois helpers que filtram self-loops automaticamente:

```typescript
const findNextEdge = (nodeId: string, sourceHandle?: string) => {
  return edges.find(e => 
    e.source === nodeId && 
    e.target !== nodeId && // Previne self-loop
    (sourceHandle === undefined || e.sourceHandle === sourceHandle)
  );
};

const findAnyNextEdge = (nodeId: string) => {
  return edges.find(e => e.source === nodeId && e.target !== nodeId);
};
```

**~30 substituições** feitas em todo o arquivo para usar esses helpers ao invés de `edges.find()` direto.

### 3. ✅ Validação no Frontend (`FlowCanvas.tsx`)
Adicionada validação no `onConnect` para impedir criação de edges auto-referenciadas:

```typescript
const onConnect = useCallback(
  (params: Connection) => {
    if (params.source === params.target) {
      console.warn('[FlowCanvas] Blocked self-loop edge creation:', params.source);
      return;
    }
    setEdges((eds) => addEdge(params, eds));
  },
  [setEdges]
);
```

---

## Arquivos Modificados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/process-inbox-flow/index.ts` | Helpers `findNextEdge` e `findAnyNextEdge` + ~30 substituições |
| `src/components/flow-builder/FlowCanvas.tsx` | Validação `source !== target` no `onConnect` |
| Banco de dados | SQL executado para corrigir dados |

---

## Próximos Passos
O fluxo BIBLICO deve continuar automaticamente quando o `process-delay-queue` processar a sessão destravada.

