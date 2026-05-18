-- Add missing UPDATE RLS policy on project_document_versions
-- Root cause: ensure_project_document_initial_version trigger creates v1
-- via SECURITY DEFINER (bypasses RLS), then frontend .upsert() becomes
-- an UPDATE on the existing row, which was denied because no UPDATE policy existed.

DROP POLICY IF EXISTS "Users can update versions on accessible docs" ON public.project_document_versions;

CREATE POLICY "Users can update versions on accessible docs"
  ON public.project_document_versions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_documents pd
      WHERE pd.id = document_id
      AND public.has_project_access(auth.uid(), pd.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_documents pd
      WHERE pd.id = document_id
      AND public.has_project_access(auth.uid(), pd.project_id)
    )
  );