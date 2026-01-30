
# Plano: Reverter URL do Webhook para Supabase Original

## Resumo
Reverter a URL base do webhook de `https://zapdata.co/functions/v1` para a URL original do Supabase `https://dcjizoulbggsavizbukq.supabase.co/functions/v1`, garantindo que os webhooks da integração Logzz funcionem corretamente.

## Alteração Necessária

### Arquivo: `src/components/settings/LogzzIntegrationSettings.tsx`

**Linha 71 - De:**
```typescript
const WEBHOOK_BASE_URL = "https://zapdata.co/functions/v1";
```

**Para:**
```typescript
const WEBHOOK_BASE_URL = "https://dcjizoulbggsavizbukq.supabase.co/functions/v1";
```

## Resultado Esperado
- Os webhooks gerados para a integração Logzz usarão a URL funcional do Supabase
- Serviços externos (Logzz) conseguirão chamar os endpoints corretamente
- Não será necessária nenhuma configuração adicional no seu domínio

## Detalhes Técnicos
Esta é uma alteração simples de uma linha que restaura a configuração original. A URL do Supabase é totalmente funcional e não requer proxy ou configuração adicional.
