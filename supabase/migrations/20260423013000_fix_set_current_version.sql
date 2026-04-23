-- Migration: 20260423013000_fix_set_current_version.sql
-- Fix doc tray visibility: set_current_version now also updates project_documents.latest_version_id

-- 1) set_current_version — validates new version belongs to document + syncs latest_version_id
DROP FUNCTION IF EXISTS public.set_current_version(uuid, uuid);

CREATE OR REPLACE FUNCTION public.set_current_version(p_document_id uuid, p_new_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prev_current_id uuid;
  new_doc_id uuid;
BEGIN
  -- Validate new version belongs to the document
  SELECT document_id INTO new_doc_id
  FROM public.project_document_versions
  WHERE id = p_new_version_id;

  IF new_doc_id IS NULL THEN
    RAISE EXCEPTION 'Version % does not exist', p_new_version_id;
  END IF;

  IF new_doc_id != p_document_id THEN
    RAISE EXCEPTION 'Version % does not belong to document %', p_new_version_id, p_document_id;
  END IF;

  -- Find currently current version
  SELECT id INTO prev_current_id
  FROM public.project_document_versions
  WHERE document_id = p_document_id AND is_current = true
  LIMIT 1;

  -- Clear all current flags for this document
  UPDATE public.project_document_versions
  SET is_current = false
  WHERE document_id = p_document_id AND is_current = true;

  -- Mark the previous current as superseded
  IF prev_current_id IS NOT NULL THEN
    UPDATE public.project_document_versions
    SET superseded_at = now(),
        superseded_by = p_new_version_id
    WHERE id = prev_current_id;
  END IF;

  -- Set new version as current
  UPDATE public.project_document_versions
  SET is_current = true
  WHERE id = p_new_version_id;

  -- FIX: also sync latest_version_id on project_documents so doc tray shows promoted version
  UPDATE public.project_documents
  SET latest_version_id = p_new_version_id,
      updated_at = now()
  WHERE id = p_document_id;

  RETURN jsonb_build_object(
    'old_version_id', prev_current_id,
    'new_version_id', p_new_version_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_current_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_version(uuid, uuid) TO service_role;
