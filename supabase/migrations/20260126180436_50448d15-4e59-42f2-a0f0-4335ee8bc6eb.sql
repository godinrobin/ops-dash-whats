-- Tabela para armazenar todos os eventos de webhook Logzz (apenas para visualização admin)
CREATE TABLE public.logzz_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'order', 'cart', 'shipment'
  customer_name TEXT,
  customer_phone TEXT,
  product_name TEXT,
  order_id TEXT,
  checkout_url TEXT,
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index para performance
CREATE INDEX idx_logzz_events_created_at ON public.logzz_webhook_events(created_at DESC);
CREATE INDEX idx_logzz_events_user_id ON public.logzz_webhook_events(user_id);

-- Enable RLS
ALTER TABLE public.logzz_webhook_events ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver/deletar eventos
CREATE POLICY "Admins can view all logzz events"
ON public.logzz_webhook_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete logzz events"
ON public.logzz_webhook_events
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role pode inserir (usado pelos webhooks)
CREATE POLICY "Service role can insert logzz events"
ON public.logzz_webhook_events
FOR INSERT
WITH CHECK (true);