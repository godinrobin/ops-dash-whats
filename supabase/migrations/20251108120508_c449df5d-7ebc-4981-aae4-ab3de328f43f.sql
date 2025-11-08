-- Step 1: Add product_name column (nullable initially)
ALTER TABLE public.metrics
ADD COLUMN IF NOT EXISTS product_name text;

-- Step 2: Backfill existing data
UPDATE public.metrics m
SET product_name = p.name
FROM public.products p
WHERE p.id = m.product_id
AND m.product_name IS NULL;

-- Step 3: Make column NOT NULL
ALTER TABLE public.metrics
ALTER COLUMN product_name SET NOT NULL;

-- Step 4: Create index for performance (if not exists)
CREATE INDEX IF NOT EXISTS metrics_product_id_idx
ON public.metrics (product_id);

-- Step 5: Create trigger function to set product_name on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.set_metrics_product_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name
  FROM public.products
  WHERE id = NEW.product_id;
  
  NEW.product_name = v_name;
  RETURN NEW;
END;
$function$;

-- Step 6: Create trigger on metrics table
DROP TRIGGER IF EXISTS trg_metrics_set_product_name ON public.metrics;
CREATE TRIGGER trg_metrics_set_product_name
BEFORE INSERT OR UPDATE OF product_id ON public.metrics
FOR EACH ROW
EXECUTE FUNCTION public.set_metrics_product_name();

-- Step 7: Create trigger function to propagate product name changes
CREATE OR REPLACE FUNCTION public.propagate_product_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.metrics
    SET product_name = NEW.name
    WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Step 8: Create trigger on products table
DROP TRIGGER IF EXISTS trg_products_propagate_name ON public.products;
CREATE TRIGGER trg_products_propagate_name
AFTER UPDATE OF name ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.propagate_product_name_change();