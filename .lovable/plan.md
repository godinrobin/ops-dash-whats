# Plano de Correção: Sistema de Cobrança de Instâncias WhatsApp

## Status: ✅ IMPLEMENTADO

### Correções Aplicadas:

1. **MaturadorInstances.tsx** - Alterada lógica de `hasFreeSlot` para usar `freeInstancesRemaining` do hook ao invés de contar apenas instâncias conectadas. Isso impede o exploit de desconectar instâncias para obter mais slots gratuitos.

2. **useInstanceSubscription.ts** - Corrigido `registerInstance()` para buscar a contagem atual de subscriptions diretamente do banco de dados antes de calcular se a instância deve ser gratuita. Isso evita problemas de estado desatualizado.

3. **Migração de Dados** - Criados registros em `instance_subscriptions` para as 18 instâncias órfãs criadas após a ativação do sistema. As 3 primeiras por usuário foram marcadas como gratuitas, as demais com expiração em 3 dias.

### Resultado:
- 18 instâncias agora possuem registro de subscription
- Novas instâncias serão cobradas corretamente
- Membros completos manterão suas 3 primeiras instâncias gratuitas

