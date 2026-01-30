
# Plano: Corrigir Instâncias Sem Status de Renovação

## Diagnóstico

Identifiquei a **causa raiz** do problema: a edge function `maturador-evolution` na ação `create-instance` **não retorna o ID da instância criada**. 

O código atual:
```typescript
const { error: insertError } = await supabaseClient
  .from('maturador_instances')
  .insert(insertData);
```

Deveria capturar e retornar o ID:
```typescript
const { data: insertedData, error: insertError } = await supabaseClient
  .from('maturador_instances')
  .insert(insertData)
  .select('id')
  .single();
```

**Resultado:** Quando o frontend chama `registerInstance(data.instanceId)`, o `instanceId` é `undefined`, então nenhum registro é criado na tabela `instance_subscriptions`.

### Instâncias Afetadas (sem assinatura)
| Instância | Usuário | Criada em |
|-----------|---------|-----------|
| numero_lidiane_dd11 | SILAS BARROS DE ARAUJO | 30/01 19:13 |
| W2 | luccasbiazotti10@gmail.com | 30/01 18:23 |
| neuro | kleytonkardoso1@gmail.com | 30/01 16:52 |
| ZAP | arthur alves sabino | 30/01 16:26 |

---

## Implementacao

### Parte 1: Corrigir Edge Function (Evitar Novas Orfas)

**Arquivo:** `supabase/functions/maturador-evolution/index.ts`

Alterar o insert para capturar o ID e inclui-lo na resposta:

```typescript
// Antes (linha 766-768):
const { error: insertError } = await supabaseClient
  .from('maturador_instances')
  .insert(insertData);

// Depois:
const { data: insertedData, error: insertError } = await supabaseClient
  .from('maturador_instances')
  .insert(insertData)
  .select('id')
  .single();
```

E no resultado final (linha 942-947):

```typescript
// Antes:
result = {
  ...result,
  qrcode: qrCodeBase64 ? { base64: qrCodeBase64 } : result.qrcode,
  api_provider: apiProvider,
};

// Depois:
result = {
  ...result,
  instanceId: insertedData?.id,  // <-- ADICIONAR
  qrcode: qrCodeBase64 ? { base64: qrCodeBase64 } : result.qrcode,
  api_provider: apiProvider,
};
```

### Parte 2: Backfill das 4 Instancias Orfas

Executar SQL para criar registros em `instance_subscriptions` para as instancias existentes sem assinatura. Como sao instancias novas, serao marcadas como `is_free=true` (primeira instancia de cada usuario) ou com expiracao de 3 dias (se ja tiverem 3 instancias gratuitas).

```sql
INSERT INTO instance_subscriptions (instance_id, user_id, is_free, expires_at, created_at)
SELECT 
  mi.id,
  mi.user_id,
  CASE 
    WHEN (SELECT COUNT(*) FROM instance_subscriptions WHERE user_id = mi.user_id) < 3 
    THEN true 
    ELSE false 
  END,
  CASE 
    WHEN (SELECT COUNT(*) FROM instance_subscriptions WHERE user_id = mi.user_id) < 3 
    THEN NULL 
    ELSE NOW() + INTERVAL '3 days' 
  END,
  NOW()
FROM maturador_instances mi
LEFT JOIN instance_subscriptions iss ON mi.id = iss.instance_id
WHERE iss.id IS NULL
  AND mi.status IN ('connected', 'open');
```

### Parte 3: Trigger de Seguranca (Prevencao Futura)

Criar um trigger no banco de dados que automaticamente cria um registro em `instance_subscriptions` sempre que uma nova instancia e inserida em `maturador_instances`. Isso serve como rede de seguranca caso o frontend falhe em chamar `registerInstance`.

```sql
CREATE OR REPLACE FUNCTION auto_create_instance_subscription()
RETURNS TRIGGER AS $$
DECLARE
  user_sub_count INTEGER;
  is_free_slot BOOLEAN;
BEGIN
  -- Contar quantas subscriptions o usuario ja tem
  SELECT COUNT(*) INTO user_sub_count
  FROM instance_subscriptions
  WHERE user_id = NEW.user_id;
  
  -- Primeiras 3 sao gratuitas
  is_free_slot := user_sub_count < 3;
  
  -- Inserir subscription automaticamente
  INSERT INTO instance_subscriptions (instance_id, user_id, is_free, expires_at)
  VALUES (
    NEW.id,
    NEW.user_id,
    is_free_slot,
    CASE WHEN is_free_slot THEN NULL ELSE NOW() + INTERVAL '3 days' END
  )
  ON CONFLICT (instance_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_subscription
AFTER INSERT ON maturador_instances
FOR EACH ROW
EXECUTE FUNCTION auto_create_instance_subscription();
```

---

## Resumo das Mudancas

| Item | Arquivo/Local | Acao |
|------|---------------|------|
| 1 | `supabase/functions/maturador-evolution/index.ts` | Retornar `instanceId` na resposta de `create-instance` |
| 2 | Database Migration | Backfill das 4 instancias orfas |
| 3 | Database Migration | Trigger para prevenir futuras orfas |

---

## Secao Tecnica

### Arquivos Modificados
- `supabase/functions/maturador-evolution/index.ts`
  - Linhas 766-768: Alterar insert para usar `.select('id').single()`
  - Linhas 942-947: Incluir `instanceId: insertedData?.id` no resultado

### Migracao SQL
```sql
-- Backfill existing orphan instances
INSERT INTO instance_subscriptions (instance_id, user_id, is_free, expires_at, created_at)
SELECT mi.id, mi.user_id,
  (SELECT COUNT(*) FROM instance_subscriptions WHERE user_id = mi.user_id) < 3,
  CASE WHEN (SELECT COUNT(*) FROM instance_subscriptions WHERE user_id = mi.user_id) < 3 
       THEN NULL ELSE NOW() + INTERVAL '3 days' END,
  NOW()
FROM maturador_instances mi
LEFT JOIN instance_subscriptions iss ON mi.id = iss.instance_id
WHERE iss.id IS NULL AND mi.status IN ('connected', 'open');

-- Create safety trigger
CREATE OR REPLACE FUNCTION auto_create_instance_subscription()
RETURNS TRIGGER AS $$
DECLARE user_sub_count INTEGER; is_free_slot BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO user_sub_count FROM instance_subscriptions WHERE user_id = NEW.user_id;
  is_free_slot := user_sub_count < 3;
  INSERT INTO instance_subscriptions (instance_id, user_id, is_free, expires_at)
  VALUES (NEW.id, NEW.user_id, is_free_slot,
    CASE WHEN is_free_slot THEN NULL ELSE NOW() + INTERVAL '3 days' END)
  ON CONFLICT (instance_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_subscription
AFTER INSERT ON maturador_instances
FOR EACH ROW EXECUTE FUNCTION auto_create_instance_subscription();
```
