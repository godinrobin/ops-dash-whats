-- Create table to track daily prompt usage for deliverable creator
CREATE TABLE public.deliverable_prompt_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  usage_date DATE NOT NULL,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, usage_date)
);

-- Enable Row Level Security
ALTER TABLE public.deliverable_prompt_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view their own prompt usage" 
ON public.deliverable_prompt_usage 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own usage
CREATE POLICY "Users can insert their own prompt usage" 
ON public.deliverable_prompt_usage 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own usage
CREATE POLICY "Users can update their own prompt usage" 
ON public.deliverable_prompt_usage 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function to get São Paulo date
CREATE OR REPLACE FUNCTION public.get_sao_paulo_date()
RETURNS DATE AS $$
BEGIN
  RETURN (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to increment prompt usage and return current count
CREATE OR REPLACE FUNCTION public.increment_deliverable_prompt(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_today DATE;
  v_count INTEGER;
BEGIN
  v_today := public.get_sao_paulo_date();
  
  INSERT INTO public.deliverable_prompt_usage (user_id, usage_date, prompt_count)
  VALUES (p_user_id, v_today, 1)
  ON CONFLICT (user_id, usage_date) 
  DO UPDATE SET 
    prompt_count = deliverable_prompt_usage.prompt_count + 1,
    updated_at = now()
  RETURNING prompt_count INTO v_count;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get current prompt usage
CREATE OR REPLACE FUNCTION public.get_deliverable_prompt_usage(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_today DATE;
  v_count INTEGER;
BEGIN
  v_today := public.get_sao_paulo_date();
  
  SELECT prompt_count INTO v_count
  FROM public.deliverable_prompt_usage
  WHERE user_id = p_user_id AND usage_date = v_today;
  
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger for updated_at
CREATE TRIGGER update_deliverable_prompt_usage_updated_at
BEFORE UPDATE ON public.deliverable_prompt_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();