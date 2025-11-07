-- Add order_position column to organized_numbers table
ALTER TABLE organized_numbers 
ADD COLUMN order_position integer;

-- Update existing rows with sequential order
UPDATE organized_numbers
SET order_position = row_number
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as row_number
  FROM organized_numbers
) as numbered
WHERE organized_numbers.id = numbered.id;