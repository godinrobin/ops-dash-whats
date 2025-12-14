-- Adicionar colunas à tabela sms_transactions para rastrear pagamentos PIX
ALTER TABLE public.sms_transactions 
ADD COLUMN IF NOT EXISTS external_id text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS pix_qr_code text,
ADD COLUMN IF NOT EXISTS pix_copy_paste text;

-- Criar índice para buscar transações por external_id (ID do Mercado Pago)
CREATE INDEX IF NOT EXISTS idx_sms_transactions_external_id ON public.sms_transactions(external_id);

-- Criar índice para buscar transações pendentes por user_id
CREATE INDEX IF NOT EXISTS idx_sms_transactions_status ON public.sms_transactions(status);

-- Atualizar políticas RLS para permitir update de transações próprias (para atualizar status)
CREATE POLICY "Users can update their own transactions" 
ON public.sms_transactions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Permitir que service_role insira transações (para webhook)
CREATE POLICY "Service role can insert transactions" 
ON public.sms_transactions 
FOR INSERT 
WITH CHECK (true);