-- Add reply variation mode fields to inbox_flows
ALTER TABLE public.inbox_flows 
ADD COLUMN IF NOT EXISTS reply_mode VARCHAR(20) DEFAULT 'all',
ADD COLUMN IF NOT EXISTS reply_interval INTEGER DEFAULT 3;

-- reply_mode: 'all' = todas mensagens respondem, 'interval' = responde a cada X mensagens
-- reply_interval: número de mensagens enviadas entre cada reply (quando mode = 'interval')

COMMENT ON COLUMN public.inbox_flows.reply_mode IS 'Reply mode: all = every message replies, interval = reply every N messages';
COMMENT ON COLUMN public.inbox_flows.reply_interval IS 'When reply_mode is interval, reply every N messages sent';