-- Add evolution_base_url and evolution_api_key columns to maturador_instances
-- This allows each instance to have its own Evolution API configuration
ALTER TABLE public.maturador_instances
ADD COLUMN IF NOT EXISTS evolution_base_url TEXT,
ADD COLUMN IF NOT EXISTS evolution_api_key TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_maturador_instances_evolution_config 
ON public.maturador_instances (evolution_base_url) 
WHERE evolution_base_url IS NOT NULL;

-- Add comment explaining the purpose
COMMENT ON COLUMN public.maturador_instances.evolution_base_url IS 'URL do servidor Evolution API desta instância (ex: https://api.chatwp.xyz)';
COMMENT ON COLUMN public.maturador_instances.evolution_api_key IS 'API Key do servidor Evolution para esta instância';