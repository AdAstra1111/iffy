-- scene_spine_links RLS policies
-- RLS is already enabled on the table, but no policies existed
-- This caused ALL user queries to return 0 rows (default deny)
-- Fixed by adding proper access policies matching other scene graph tables

CREATE POLICY IF NOT EXISTS "scene_spine_links_select_project_access"
ON public.scene_spine_links
FOR SELECT
USING (has_project_access(auth.uid(), project_id));

CREATE POLICY IF NOT EXISTS "scene_spine_links_insert_project_access"
ON public.scene_spine_links
FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
);

CREATE POLICY IF NOT EXISTS "scene_spine_links_update_project_access"
ON public.scene_spine_links
FOR UPDATE
USING (has_project_access(auth.uid(), project_id))
WITH CHECK (has_project_access(auth.uid(), project_id));

CREATE POLICY IF NOT EXISTS "scene_spine_links_delete_project_access"
ON public.scene_spine_links
FOR DELETE
USING (has_project_access(auth.uid(), project_id));
