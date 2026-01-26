-- Create atomic function to add a tag to inbox_contacts without race conditions
CREATE OR REPLACE FUNCTION public.add_tag_to_contact(
  p_contact_id uuid,
  p_tag_name text
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_tags text[];
BEGIN
  -- Use UPDATE with array_append and DISTINCT to atomically add tag if not exists
  UPDATE inbox_contacts
  SET tags = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}'::text[]) || ARRAY[p_tag_name]))
  ),
  updated_at = now()
  WHERE id = p_contact_id
  RETURNING tags INTO result_tags;
  
  RETURN result_tags;
END;
$$;

-- Create atomic function to remove a tag from inbox_contacts
CREATE OR REPLACE FUNCTION public.remove_tag_from_contact(
  p_contact_id uuid,
  p_tag_name text
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_tags text[];
BEGIN
  UPDATE inbox_contacts
  SET tags = array_remove(COALESCE(tags, '{}'::text[]), p_tag_name),
  updated_at = now()
  WHERE id = p_contact_id
  RETURNING tags INTO result_tags;
  
  RETURN result_tags;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.add_tag_to_contact(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_tag_to_contact(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_tag_from_contact(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_tag_from_contact(uuid, text) TO service_role;