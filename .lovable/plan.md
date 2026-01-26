
# Plano: Verificação e Correção do Sistema de Assinaturas de Instâncias

## Resumo da Análise

Analisei detalhadamente o sistema de assinaturas de instâncias WhatsApp e identifiquei os seguintes pontos:

## Status Atual

### O que está funcionando

1. **Contagem regressiva de dias**: O hook `useInstanceSubscription` calcula corretamente os dias restantes baseado no campo `expires_at` da tabela `instance_subscriptions`
2. **Renovação manual**: A função `renewInstance` deduz 6 créditos e estende a data de expiração em 30 dias
3. **Interface visual**: O componente `InstanceRenewalTag` exibe corretamente o badge com dias restantes e animação de pulso quando faltam 3 dias ou menos
4. **Cron Job configurado**: O job `process-instance-renewals-daily` está agendado para rodar às 6h UTC diariamente

### Problemas Identificados

| Problema | Impacto | Severidade |
|----------|---------|------------|
| Secrets UAZAPI não configuradas | A função não consegue deletar instâncias na UAZAPI | CRÍTICO |
| Tabela `instance_subscriptions` vazia | Instâncias existentes não estão sendo rastreadas | ALTO |
| Sistema de créditos inativo | Contagem de dias não está ativa para usuários | BAIXO |

## Detalhamento dos Problemas

### 1. Secrets UAZAPI não configuradas

A Edge Function `process-instance-renewals` tenta usar:
```typescript
const uazapiUrl = Deno.env.get('UAZAPI_URL');
const uazapiToken = Deno.env.get('UAZAPI_TOKEN');
```

Porém, essas secrets **não existem** no projeto. A configuração UAZAPI está armazenada na tabela `whatsapp_api_config`:
- **uazapi_base_url**: `https://zapdata.uazapi.com`
- **uazapi_api_token**: Token administrativo existente

### 2. Tabela `instance_subscriptions` vazia

Atualmente há 0 registros na tabela `instance_subscriptions`, mas existem múltiplas instâncias na tabela `maturador_instances`. Isso significa que:
- Nenhuma instância está sendo monitorada para expiração
- A função de limpeza não encontrará instâncias para deletar
- Os usuários não verão tags de renovação

### 3. Instâncias não são registradas automaticamente

O registro de subscription só ocorre na criação de novas instâncias (linha 367 de `MaturadorInstances.tsx`):
```typescript
if (data.instanceId) {
  await registerInstance(data.instanceId);
}
```

Instâncias já existentes nunca foram registradas na tabela `instance_subscriptions`.

---

## Correções Necessárias

### Correção 1: Atualizar Edge Function para usar configuração do banco

Modificar `supabase/functions/process-instance-renewals/index.ts` para buscar as credenciais UAZAPI da tabela `whatsapp_api_config` em vez de variáveis de ambiente:

```typescript
// Buscar configuração UAZAPI do banco de dados
const { data: apiConfig } = await supabase
  .from('whatsapp_api_config')
  .select('uazapi_base_url, uazapi_api_token')
  .single();

const uazapiUrl = apiConfig?.uazapi_base_url;
const uazapiToken = apiConfig?.uazapi_api_token;
```

### Correção 2: Popular tabela `instance_subscriptions` com instâncias existentes

Criar uma migração que registra todas as instâncias existentes na tabela de subscriptions. Para membros completos, as 3 primeiras instâncias serão marcadas como gratuitas.

```text
Fluxo da Migração:
1. Buscar todas instâncias de maturador_instances
2. Agrupar por user_id
3. Ordenar por created_at
4. Inserir na instance_subscriptions:
   - Primeiras 3 por usuário: is_free = true, expires_at = null
   - Demais: is_free = false, expires_at = now() + 30 dias
```

### Correção 3: Adicionar verificação de membership na migração

A migração deve verificar se o usuário é `is_full_member` antes de conceder instâncias gratuitas. Usuários semi-full não recebem gratuidade.

---

## Fluxo Completo Após Correções

```text
┌─────────────────────────────────────────────────────────────────┐
│                    CICLO DE VIDA DA INSTÂNCIA                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CRIAÇÃO                                                     │
│     └── registerInstance() → instance_subscriptions             │
│         ├── Full Member (1-3): is_free=true, expires_at=null    │
│         └── Demais: is_free=false, expires_at=+30 dias          │
│                                                                 │
│  2. MONITORAMENTO (Frontend)                                    │
│     └── getDaysRemaining() calcula diff entre now e expires_at  │
│         └── InstanceRenewalTag exibe badge com contagem         │
│                                                                 │
│  3. RENOVAÇÃO (Usuário clica no badge)                          │
│     └── renewInstance() deduz 6 créditos                        │
│         └── Atualiza expires_at += 30 dias                      │
│                                                                 │
│  4. EXPIRAÇÃO (Cron às 6h UTC)                                  │
│     └── process-instance-renewals busca expires_at < now()      │
│         ├── Deleta dados relacionados (messages, contacts, etc) │
│         ├── Deleta da UAZAPI via API                            │
│         └── Deleta da maturador_instances                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/process-instance-renewals/index.ts` | Buscar UAZAPI config do banco em vez de env vars |
| Nova migração SQL | Popular instance_subscriptions com instâncias existentes |

---

## Seção Técnica

### Detalhes da Edge Function Corrigida

```typescript
// ANTES (não funciona - secrets não existem)
const uazapiUrl = Deno.env.get('UAZAPI_URL');
const uazapiToken = Deno.env.get('UAZAPI_TOKEN');

// DEPOIS (busca do banco de dados)
const { data: apiConfig } = await supabase
  .from('whatsapp_api_config')
  .select('uazapi_base_url, uazapi_api_token')
  .single();

const uazapiUrl = apiConfig?.uazapi_base_url?.replace(/\/$/, '');
const uazapiToken = apiConfig?.uazapi_api_token;
```

### SQL da Migração para Popular Subscriptions

```sql
-- Inserir subscriptions para instâncias existentes
INSERT INTO public.instance_subscriptions (instance_id, user_id, is_free, expires_at, created_at)
SELECT 
  mi.id as instance_id,
  mi.user_id,
  CASE 
    WHEN p.is_full_member = true 
         AND p.is_semi_full_member IS NOT TRUE
         AND row_num <= 3 THEN true
    ELSE false
  END as is_free,
  CASE 
    WHEN p.is_full_member = true 
         AND p.is_semi_full_member IS NOT TRUE
         AND row_num <= 3 THEN NULL
    ELSE NOW() + INTERVAL '30 days'
  END as expires_at,
  mi.created_at
FROM (
  SELECT 
    id, 
    user_id, 
    created_at,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as row_num
  FROM public.maturador_instances
  WHERE status IN ('connected', 'open')
) mi
JOIN public.profiles p ON p.id = mi.user_id
ON CONFLICT (instance_id) DO NOTHING;
```

### Verificação Pós-Implementação

Após aplicar as correções, execute estas queries para verificar:

```sql
-- 1. Verificar subscriptions criadas
SELECT COUNT(*) as total, is_free FROM instance_subscriptions GROUP BY is_free;

-- 2. Verificar próximas a expirar
SELECT * FROM instance_subscriptions 
WHERE expires_at IS NOT NULL 
  AND expires_at < NOW() + INTERVAL '7 days';

-- 3. Testar manualmente a função de cleanup
SELECT net.http_post(
  'https://dcjizoulbggsavizbukq.supabase.co/functions/v1/process-instance-renewals',
  '{"Content-Type": "application/json"}'::jsonb,
  '{}'::jsonb
);
```

---

## Notas Importantes

1. **Sistema de créditos está inativo**: O `credits_system_config.status = 'inactive'`. Quando ativado, os usuários verão as tags de renovação
2. **Membros Semi-Full**: Nunca recebem instâncias gratuitas, independente da ordem de criação
3. **Cron já configurado**: O job `process-instance-renewals-daily` já existe e roda às 6h UTC diariamente
