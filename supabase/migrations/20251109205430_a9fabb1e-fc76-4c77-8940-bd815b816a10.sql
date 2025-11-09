-- Create tracked_offers table
CREATE TABLE public.tracked_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  ad_library_link TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create offer_metrics table to track daily performance
CREATE TABLE public.offer_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES public.tracked_offers(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  active_ads_count INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(offer_id, date)
);

-- Enable RLS
ALTER TABLE public.tracked_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tracked_offers
CREATE POLICY "Users can view their own offers"
ON public.tracked_offers
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tracked_offers
  WHERE tracked_offers.user_id = auth.uid()
));

CREATE POLICY "Users can insert their own offers"
ON public.tracked_offers
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own offers"
ON public.tracked_offers
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own offers"
ON public.tracked_offers
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for offer_metrics
CREATE POLICY "Users can view metrics of their offers"
ON public.offer_metrics
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tracked_offers
  WHERE tracked_offers.id = offer_metrics.offer_id
  AND tracked_offers.user_id = auth.uid()
));

CREATE POLICY "Users can insert metrics for their offers"
ON public.offer_metrics
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tracked_offers
  WHERE tracked_offers.id = offer_metrics.offer_id
  AND tracked_offers.user_id = auth.uid()
));

CREATE POLICY "Users can update metrics of their offers"
ON public.offer_metrics
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.tracked_offers
  WHERE tracked_offers.id = offer_metrics.offer_id
  AND tracked_offers.user_id = auth.uid()
));

CREATE POLICY "Users can delete metrics of their offers"
ON public.offer_metrics
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.tracked_offers
  WHERE tracked_offers.id = offer_metrics.offer_id
  AND tracked_offers.user_id = auth.uid()
));