-- Atualizar todos os fluxos existentes de 'exact' para 'contains' para restaurar comportamento original
UPDATE inbox_flows 
SET keyword_match_type = 'contains' 
WHERE keyword_match_type = 'exact' 
  AND trigger_type = 'keyword';