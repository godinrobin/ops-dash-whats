

# Plano: Adicionar URL de Redirecionamento nas Notificações Push de Venda

## Resumo

Implementar a funcionalidade que adiciona a URL do anúncio (`ad_source_url`) às notificações push de venda, permitindo que quando o usuário clique na notificação, seja redirecionado diretamente para o anúncio que originou aquela venda.

## Confirmação da Documentação OneSignal

A documentação do OneSignal confirma que é possível adicionar uma URL de redirecionamento usando os seguintes parâmetros:

- **`url`** - URL geral para todas as plataformas
- **`web_url`** - URL específica para notificações web push

Quando configurado, ao clicar na notificação, o navegador abre automaticamente a URL especificada.

## Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUXO ATUAL                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  tag-whats-process                                                       │
│  ├── Detecta PIX                                                         │
│  ├── Recupera inbox_contacts.ad_source_url  ← JÁ EXISTE                 │
│  └── Insere em push_notification_queue (SEM url)                         │
│                                                                          │
│  process-push-queue                                                      │
│  └── Envia para OneSignal (SEM url)                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUXO PROPOSTO                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  tag-whats-process                                                       │
│  ├── Detecta PIX                                                         │
│  ├── Recupera inbox_contacts.ad_source_url                               │
│  └── Insere em push_notification_queue (COM click_url)  ← NOVO          │
│                                                                          │
│  process-push-queue                                                      │
│  └── Envia para OneSignal (COM url/web_url)  ← NOVO                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Etapas de Implementação

### 1. Migração de Banco de Dados
Adicionar coluna `click_url` à tabela `push_notification_queue`:
- **Coluna**: `click_url` (tipo `TEXT`, nullable)
- **Propósito**: Armazenar a URL que será aberta quando o usuário clicar na notificação

### 2. Atualizar `tag-whats-process/index.ts`
Modificar a inserção na fila de notificações para incluir o `ad_source_url`:
- Usar o `adSourceUrl` que já é recuperado do `inbox_contacts` (linha ~1355)
- Passar esse valor no campo `click_url` ao inserir na `push_notification_queue`

### 3. Atualizar `process-push-queue/index.ts`
Modificar o payload enviado ao OneSignal:
- Incluir o parâmetro `url` (ou `web_url`) com o valor de `notification.click_url`
- O OneSignal redirecionará automaticamente o usuário ao clicar

### 4. Atualizar `check-lead-rotation/index.ts` (Opcional)
Se desejar, também podemos adicionar suporte a URL de redirecionamento para notificações de rotação de leads.

## Detalhes Técnicos

### Payload OneSignal Atualizado

```typescript
const oneSignalPayload = {
  app_id: oneSignalAppId,
  include_subscription_ids: subscriptionIds,
  headings: { en: notification.title },
  contents: { en: notification.message },
  chrome_web_icon: notification.icon_url,
  firefox_icon: notification.icon_url,
  // NOVO: URL de redirecionamento ao clicar
  url: notification.click_url || undefined,
  web_url: notification.click_url || undefined,
};
```

### Inserção na Fila Atualizada

```typescript
await supabase
  .from("push_notification_queue")
  .insert({
    user_id: ownerProfile.id,
    subscription_ids: ownerProfile.push_subscription_ids,
    title: notificationTitle,
    message: notificationMessage,
    icon_url: "https://zapdata.com.br/favicon.png",
    // NOVO: URL do anúncio que originou a venda
    click_url: adSourceUrl || null,
  });
```

## Comportamento Esperado

1. **Venda detectada** → Sistema identifica o pagamento PIX
2. **URL do anúncio recuperada** → Sistema busca `ad_source_url` do contato
3. **Notificação enfileirada** → URL incluída no registro da fila
4. **Notificação enviada** → OneSignal recebe a URL no payload
5. **Usuário clica** → Navegador abre a URL do anúncio diretamente

## Observações

- Se o contato não tiver `ad_source_url` (venda orgânica), a notificação funcionará normalmente sem redirecionamento
- A URL passa por validação implícita (deve ser HTTPS para funcionar corretamente no OneSignal)
- Compatível com links curtos como `fb.me` que serão expandidos pelo navegador

## Arquivos a Serem Modificados

1. **Nova migração SQL** - Adicionar coluna `click_url`
2. `supabase/functions/tag-whats-process/index.ts` - Incluir `click_url` na inserção
3. `supabase/functions/process-push-queue/index.ts` - Passar `url` para OneSignal

