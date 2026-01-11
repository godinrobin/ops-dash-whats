-- Adicionar colunas para notificações push na tabela profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS push_webhook_url text,
ADD COLUMN IF NOT EXISTS push_webhook_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS push_subscription_ids text[] DEFAULT '{}';

COMMENT ON COLUMN profiles.push_webhook_url IS 'URL do webhook do Laravel para notificacoes push';
COMMENT ON COLUMN profiles.push_webhook_enabled IS 'Toggle para ativar/desativar notificacoes push';
COMMENT ON COLUMN profiles.push_subscription_ids IS 'Array de subscription IDs do OneSignal';