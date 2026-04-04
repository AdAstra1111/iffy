
CREATE TABLE public.scene_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  title text,
  source_doc_type text NOT NULL DEFAULT 'story_outline',
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  location_key text,
  character_keys text[] NOT NULL DEFAULT '{}',
  wardrobe_state_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, scene_number)
);

ALTER TABLE public.scene_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read scene_index for accessible projects"
  ON public.scene_index FOR SELECT TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can insert scene_index for accessible projects"
  ON public.scene_index FOR INSERT TO authenticated
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update scene_index for accessible projects"
  ON public.scene_index FOR UPDATE TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete scene_index for accessible projects"
  ON public.scene_index FOR DELETE TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE TRIGGER set_scene_index_updated_at
  BEFORE UPDATE ON public.scene_index
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
