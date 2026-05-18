DROP FUNCTION IF EXISTS public.exec_sql(text);

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $_$
DECLARE
  result json;
BEGIN
  EXECUTE 'SELECT COALESCE(json_agg(row_to_json(d)), ' || chr(39) || '[]' || chr(39) || '::json) FROM (' || query || ') d' INTO result;
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      EXECUTE query;
      RETURN '[]'::json;
    END;
END;
$_$;
