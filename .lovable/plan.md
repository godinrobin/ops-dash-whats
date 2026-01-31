
# Plano: Correção do Bug de Delay Consecutivo no Automati-Zap

## Resumo do Problema

O fluxo do usuário "glemerson" travou após enviar a mensagem "*Assim que fizer o PIX, me envia o comprovante por gentileza*" porque o delay de 2 minutos que seguia não foi executado.

## Causa Raiz Identificada

O bug está na função `process-delay-queue` que **sempre marca o delay job como `done`** após invocar `process-inbox-flow`, mesmo quando o fluxo criou um **novo delay job** para o próximo nó de delay.

### Sequência do Bug

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  TIMELINE DO BUG                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  18:16:01  "Conto com sua honestidade..." enviada                        │
│  18:16:02  Delay job criado (delay de 1 min, run_at: 18:17:02)          │
│  18:17:02  process-delay-queue executa o job                            │
│            → Invoca process-inbox-flow com resumeFromDelay=true         │
│                                                                          │
│  [Dentro do process-inbox-flow]                                          │
│  18:17:10  Envia "*Assim que fizer o PIX..."                             │
│            → Avança para delay de 2 min                                  │
│            → UPSERT job com run_at: 18:19:10, status: 'scheduled'       │
│            → Retorna sucesso                                             │
│                                                                          │
│  [De volta ao process-delay-queue]                                       │
│  18:17:10  🔴 BUG: Marca job como 'done' (sobrescrevendo scheduled!)    │
│                                                                          │
│  [Resultado]                                                             │
│  O job agora tem status='done' ao invés de 'scheduled'                  │
│  O delay de 2 minutos NUNCA será processado!                            │
└─────────────────────────────────────────────────────────────────────────┘
```

## Localização do Bug

**Arquivo:** `supabase/functions/process-delay-queue/index.ts`
**Linhas:** 454-461

```typescript
// Mark job as done
await supabase
  .from("inbox_flow_delay_jobs")
  .update({ 
    status: "done",
    updated_at: new Date().toISOString()
  })
  .eq("session_id", job.session_id);
```

## Solução Proposta

Antes de marcar o job como `done`, verificar se o fluxo criou um **novo delay agendado** (retorno com `scheduledDelay: true`) ou se o job foi reagendado com um novo `run_at`.

### Detalhes Técnicos

1. **Verificar o retorno do `process-inbox-flow`:**
   - Se `invokeResult.scheduledDelay === true`, o fluxo criou um novo delay e o job já foi atualizado com novo `run_at` e `status: 'scheduled'`
   - Nesse caso, **NÃO** marcar o job como `done`

2. **Verificar se o job foi reagendado:**
   - Após invocar o fluxo, buscar o estado atual do job
   - Se `status === 'scheduled'` e `run_at` é no futuro, não sobrescrever

### Código da Correção

Na função `processJobAsync` (linhas 418-464), após invocar `process-inbox-flow`, adicionar verificação:

```typescript
// NOVA LÓGICA: Verificar se o fluxo agendou um novo delay
// Se sim, o job já foi atualizado com novo run_at e status='scheduled'
// NÃO devemos sobrescrever com status='done'
const flowScheduledNewDelay = 
  invokeResult && 
  typeof invokeResult === 'object' && 
  (invokeResult as any).scheduledDelay === true;

if (flowScheduledNewDelay) {
  console.log(`[process-delay-queue] Flow scheduled a new delay for session ${job.session_id}, NOT marking job as done`);
  return { success: true, processed: true };
}

// Verificação adicional: buscar estado atual do job
const { data: currentJob } = await supabase
  .from("inbox_flow_delay_jobs")
  .select("status, run_at")
  .eq("session_id", job.session_id)
  .single();

// Se o job já foi reagendado (status=scheduled com run_at futuro), não sobrescrever
if (currentJob?.status === 'scheduled' && currentJob?.run_at) {
  const runAtTime = new Date(currentJob.run_at).getTime();
  if (runAtTime > Date.now()) {
    console.log(`[process-delay-queue] Job was rescheduled to ${currentJob.run_at}, NOT marking as done`);
    return { success: true, processed: true };
  }
}

// Original: Mark job as done
await supabase
  .from("inbox_flow_delay_jobs")
  .update({ 
    status: "done",
    updated_at: new Date().toISOString()
  })
  .eq("session_id", job.session_id);
```

## Arquivos a Serem Modificados

1. **`supabase/functions/process-delay-queue/index.ts`**
   - Adicionar verificação antes de marcar job como `done`
   - Respeitar quando o fluxo agenda um novo delay

## Testes Necessários

1. Fluxo com delays consecutivos (1 min → texto → 2 min → texto)
2. Verificar que todos os delays são executados corretamente
3. Verificar que não há mensagens duplicadas

## Impacto

Esta correção resolve o problema de delays consecutivos no Automati-Zap, garantindo que quando um delay completa e o fluxo avança para outro delay, o novo job seja preservado corretamente.
