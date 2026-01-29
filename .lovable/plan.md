
# Plano de Correção de Segurança - OPS Dashboard WhatsApp

## Resumo Executivo

Este plano aborda **4 vulnerabilidades críticas** identificadas na auditoria de segurança, garantindo que a funcionalidade da plataforma permaneça intacta enquanto implementamos proteções adequadas no backend.

---

## Vulnerabilidade 1: Bypass de Acesso Premium (CRÍTICA)

### Problema
As Edge Functions premium (geradoras de áudio, imagens, vídeos, etc.) **não verificam se o usuário é membro premium** antes de processar a requisição. Qualquer usuário autenticado pode consumir APIs pagas (ElevenLabs, OpenAI, FAL AI).

### Impacto
- Custo financeiro descontrolado com APIs externas
- Abuso por usuários não pagantes

### Solução

**1.1. Criar função utilitária compartilhada de validação**

Criar um arquivo `supabase/functions/_shared/validateAccess.ts` com função reutilizável:

```text
+-------------------+
|  validateAccess   |
+-------------------+
        |
        v
+-------------------+
| 1. Valida JWT     |
+-------------------+
        |
        v
+-------------------+
| 2. Busca profile  |
|  (is_full_member) |
+-------------------+
        |
        v
+-------------------+
| 3. Busca role     |
|    (admin)        |
+-------------------+
        |
        v
+-------------------+
| 4. Retorna        |
| {isValid, userId} |
+-------------------+
```

**1.2. Atualizar as 15+ Edge Functions premium:**

| Prioridade | Função | Custo API |
|------------|--------|-----------|
| CRITICA | generate-audio | ElevenLabs |
| CRITICA | generate-creative-image | OpenAI GPT-Image |
| CRITICA | generate-whatsapp-funnel | GPT-4 |
| CRITICA | generate-video-variations | FAL/Shotstack |
| CRITICA | transcribe-audio | Whisper |
| CRITICA | analyze-creative-image | GPT-4 Vision |
| CRITICA | analyze-creative-video | GPT-4 Vision |
| ALTA | edit-funnel-with-ai | GPT-4 |
| ALTA | edit-creative-with-ai | GPT-4 |
| ALTA | generate-creative-copy | GPT-4 |
| ALTA | generate-from-reference | OpenAI |
| ALTA | generate-deliverable | GPT-4 |
| ALTA | clone-site | Custo de servidor |
| ALTA | keyword-generator-chat | GPT-4 |
| ALTA | add-subtitles-to-video | Processamento |
| ALTA | remove-watermark | Processamento |
| ALTA | merge-videos | Processamento |
| ALTA | add-audio-to-video | Processamento |

**1.3. Corrigir fallbacks inseguros no frontend**

- `src/hooks/useAccessLevel.ts`: Mudar fallback de `true` para `false`
- `src/components/MemberRoute.tsx`: Mudar fallback de `true` para `false`

**1.4. Remover cache de localStorage**

O cache `access_level_cache` no localStorage é manipulável. Remover completamente e sempre validar no backend.

---

## Vulnerabilidade 2: Bypass de Acesso Admin via Override (CRÍTICA)

### Problema
Embora as Edge Functions admin já validem role, a **interface do painel admin** pode ser visualizada por qualquer usuário via DevTools Override, expondo estrutura de menus e funcionalidades.

### Impacto
- Exposição de informações sensíveis sobre a estrutura do sistema
- Possibilidade de descobrir endpoints e tentar ataques

### Solução

**2.1. Verificar todas as Edge Functions admin**

Garantir que TODAS as funções com prefixo `admin-*` validam role de admin:

| Função | Status Atual | Ação |
|--------|-------------|------|
| admin-get-all-data | OK (valida) | Manter |
| admin-sync-instances | OK (valida) | Manter |
| admin-sync-conversations | Verificar | Adicionar se necessário |
| admin-notify-handler | NAO VALIDA | CORRIGIR |
| admin-backfill-sales-attribution | OK (valida) | Manter |
| admin-facebook-insights | Verificar | Adicionar se necessário |
| sms-admin-recharge | OK (valida) | Manter |

**2.2. admin-notify-handler - CORRIGIR**

Esta função processa comandos sem validar se o chamador é admin autenticado. Adicionar validação no início.

**2.3. Não expor dados sensíveis em mensagens de erro**

Padronizar respostas de erro para não revelar informações sobre a estrutura interna.

---

## Vulnerabilidade 3: Manipulação de Saldo do Marketplace (CRÍTICA)

### Problema
Usuários podem manipular seu próprio saldo diretamente via chamada ao Supabase porque a política RLS permite UPDATE irrestrito na carteira.

### Impacto
- Usuários podem dar saldo infinito a si mesmos
- Compras fraudulentas no Marketplace

### Solução

**3.1. Remover política de UPDATE direto na carteira**

```sql
-- Remover política que permite UPDATE direto pelo usuário
DROP POLICY IF EXISTS "Users can update their own wallet" ON public.sms_user_wallets;
```

**3.2. Adicionar constraint de saldo não-negativo**

```sql
-- Impedir saldo negativo
ALTER TABLE public.sms_user_wallets 
ADD CONSTRAINT sms_user_wallets_balance_positive CHECK (balance >= 0);
```

**3.3. Criar Stored Procedure para compras atômicas**

Criar função `marketplace_purchase` que:
- Verifica saldo atual com LOCK (FOR UPDATE)
- Valida se saldo >= preço
- Debita atomicamente
- Cria ordem e transação
- Retorna resultado

**3.4. Criar Edge Function para débitos seguros**

Como alternativa ou complemento, criar `marketplace-debit` que:
- Valida JWT
- Verifica saldo no backend
- Executa débito com service role
- Retorna novo saldo

**3.5. Atualizar Marketplace.tsx**

Substituir o UPDATE direto pela chamada à Stored Procedure ou Edge Function.

---

## Vulnerabilidade 4: Outras Melhorias de Segurança (MÉDIA)

### 4.1. CORS Headers Muito Permissivos

**Problema:** Todas as Edge Functions usam `Access-Control-Allow-Origin: '*'`

**Solução:** Restringir para domínios conhecidos:
- `https://ops-dash-whats.lovable.app`
- `https://*.lovableproject.com` (preview)
- `http://localhost:*` (desenvolvimento)

### 4.2. Rate Limiting (Recomendação)

Implementar rate limiting básico para funções premium usando tabela de controle no banco.

### 4.3. Logging de Segurança (Recomendação)

Registrar tentativas de acesso não autorizado para monitoramento.

---

## Arquivos que Serão Modificados

### Novos Arquivos
| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/_shared/validateAccess.ts` | Função utilitária de validação |

### Edge Functions (15+ arquivos)
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/generate-audio/index.ts` | Adicionar validação de membership |
| `supabase/functions/generate-creative-image/index.ts` | Adicionar validação de membership |
| `supabase/functions/generate-whatsapp-funnel/index.ts` | Adicionar validação de membership |
| `supabase/functions/generate-video-variations/index.ts` | Adicionar validação de membership |
| `supabase/functions/transcribe-audio/index.ts` | Adicionar validação de membership |
| `supabase/functions/analyze-creative-image/index.ts` | Adicionar validação de membership |
| `supabase/functions/analyze-creative-video/index.ts` | Adicionar validação de membership |
| `supabase/functions/edit-funnel-with-ai/index.ts` | Adicionar validação de membership |
| `supabase/functions/edit-creative-with-ai/index.ts` | Adicionar validação de membership |
| `supabase/functions/generate-creative-copy/index.ts` | Adicionar validação de membership |
| `supabase/functions/generate-from-reference/index.ts` | Adicionar validação de membership |
| `supabase/functions/generate-deliverable/index.ts` | Adicionar validação de membership |
| `supabase/functions/clone-site/index.ts` | Adicionar validação de membership |
| `supabase/functions/keyword-generator-chat/index.ts` | Adicionar validação de membership |
| `supabase/functions/add-subtitles-to-video/index.ts` | Adicionar validação de membership |
| `supabase/functions/remove-watermark/index.ts` | Adicionar validação de membership |
| `supabase/functions/merge-videos/index.ts` | Adicionar validação de membership |
| `supabase/functions/add-audio-to-video/index.ts` | Adicionar validação de membership |
| `supabase/functions/admin-notify-handler/index.ts` | Adicionar validação de admin |

### Frontend (3 arquivos)
| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAccessLevel.ts` | Remover cache localStorage, corrigir fallback |
| `src/components/MemberRoute.tsx` | Corrigir fallback para false |
| `src/pages/Marketplace.tsx` | Usar stored procedure para compras |

### Database (1 migration)
| Arquivo | Alteração |
|---------|-----------|
| Nova migration | DROP policy UPDATE wallet, ADD CHECK constraint, CREATE stored procedure |

---

## Ordem de Implementação

### Fase 1: Correções Críticas de Backend (Prioridade Máxima)
1. Criar `_shared/validateAccess.ts`
2. Atualizar as 15+ Edge Functions premium
3. Corrigir `admin-notify-handler`

### Fase 2: Proteção do Marketplace
4. Criar migration para wallet (DROP policy, ADD constraint)
5. Criar stored procedure `marketplace_purchase`
6. Atualizar `Marketplace.tsx`

### Fase 3: Correções de Frontend
7. Corrigir `useAccessLevel.ts` (remover cache, corrigir fallback)
8. Corrigir `MemberRoute.tsx` (corrigir fallback)

### Fase 4: Melhorias (Opcional)
9. Restringir CORS (se necessário)
10. Implementar rate limiting
11. Implementar logging de segurança

---

## Detalhes Técnicos

### Estrutura da função validateAccess

```typescript
// supabase/functions/_shared/validateAccess.ts

export interface AccessValidation {
  isValid: boolean;
  userId: string | null;
  isFullMember: boolean;
  isAdmin: boolean;
  error?: string;
}

export async function validateUserAccess(
  authHeader: string | null,
  requiredAccess: 'authenticated' | 'member' | 'admin' = 'member'
): Promise<AccessValidation>
```

### Stored Procedure marketplace_purchase

```sql
CREATE OR REPLACE FUNCTION public.marketplace_purchase(
  p_user_id UUID,
  p_product_id UUID,
  p_product_name TEXT,
  p_quantity INTEGER,
  p_total_price DECIMAL(10,2)
) RETURNS JSON
```

Retorna:
- `{success: true, order_id: uuid, new_balance: number}` em sucesso
- `{success: false, error: string}` em falha

---

## Garantias de Não-Quebra de Funcionalidade

1. **Frontend continua funcionando normalmente** - apenas adiciona validações no backend
2. **Usuários premium/admin** - não serão afetados, continuam com acesso total
3. **Fluxo de compra** - permanece igual visualmente, apenas validação muda para backend
4. **APIs existentes** - mantêm mesmos parâmetros e respostas
5. **Mensagens de erro** - claras e informativas para o usuário

---

## Resultado Esperado

Após implementação:
- Usuários não-membros receberão erro 403 ao tentar usar funções premium
- Manipulação de saldo via console será impossível (policy removida)
- Saldo negativo será bloqueado (constraint CHECK)
- Todas as funções admin terão proteção dupla (frontend + backend)
- Cache de acesso não poderá ser manipulado (removido)
