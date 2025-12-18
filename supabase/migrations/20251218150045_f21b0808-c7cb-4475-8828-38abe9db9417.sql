-- Tabela de aprendizagem para análise de criativos (vídeo e imagem)
CREATE TABLE public.ai_creative_learnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  creative_type TEXT NOT NULL CHECK (creative_type IN ('video', 'image')),
  creative_url TEXT,
  transcription TEXT,
  analysis_result JSONB NOT NULL,
  improvement_points JSONB,
  user_feedback TEXT,
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  niche TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de aprendizagem para criador de funis
CREATE TABLE public.ai_funnel_learnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  funnel_config JSONB NOT NULL,
  funnel_content JSONB NOT NULL,
  pegada TEXT CHECK (pegada IN ('white', 'black', 'muito_black')),
  tone TEXT,
  niche TEXT,
  user_feedback TEXT,
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  edit_suggestions TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de padrões de sucesso identificados pela IA
CREATE TABLE public.ai_success_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('creative_video', 'creative_image', 'funnel')),
  pattern_name TEXT NOT NULL,
  pattern_description TEXT NOT NULL,
  pattern_data JSONB NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC(5,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_creative_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_funnel_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_success_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policies para ai_creative_learnings
CREATE POLICY "Users can insert their own creative learnings"
ON public.ai_creative_learnings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own creative learnings"
ON public.ai_creative_learnings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own creative learnings"
ON public.ai_creative_learnings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all creative learnings"
ON public.ai_creative_learnings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para ai_funnel_learnings
CREATE POLICY "Users can insert their own funnel learnings"
ON public.ai_funnel_learnings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own funnel learnings"
ON public.ai_funnel_learnings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own funnel learnings"
ON public.ai_funnel_learnings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all funnel learnings"
ON public.ai_funnel_learnings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para ai_success_patterns (leitura pública para IA usar)
CREATE POLICY "Anyone can view success patterns"
ON public.ai_success_patterns FOR SELECT
USING (true);

CREATE POLICY "Service role can manage success patterns"
ON public.ai_success_patterns FOR ALL
USING (auth.role() = 'service_role');

-- Índices para performance
CREATE INDEX idx_creative_learnings_type ON public.ai_creative_learnings(creative_type);
CREATE INDEX idx_creative_learnings_niche ON public.ai_creative_learnings(niche);
CREATE INDEX idx_funnel_learnings_niche ON public.ai_funnel_learnings(niche);
CREATE INDEX idx_funnel_learnings_pegada ON public.ai_funnel_learnings(pegada);
CREATE INDEX idx_success_patterns_type ON public.ai_success_patterns(pattern_type);