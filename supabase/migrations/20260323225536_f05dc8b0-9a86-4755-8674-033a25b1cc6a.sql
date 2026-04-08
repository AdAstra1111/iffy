
-- Scene demo generation runs
CREATE TABLE IF NOT EXISTS public.scene_demo_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL,
  plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  slot_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scene demo generated images
CREATE TABLE IF NOT EXISTS public.scene_demo_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.scene_demo_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  character_key text,
  status text NOT NULL DEFAULT 'queued',
  prompt_used text,
  negative_prompt text,
  generation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  public_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scene_demo_runs_project ON public.scene_demo_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_scene_demo_runs_scene ON public.scene_demo_runs(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_demo_images_run ON public.scene_demo_images(run_id);

-- RLS
ALTER TABLE public.scene_demo_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_demo_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scene demo runs"
  ON public.scene_demo_runs FOR ALL TO authenticated
  USING (public.has_project_access(auth.uid(), project_id))
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can manage own scene demo images"
  ON public.scene_demo_images FOR ALL TO authenticated
  USING (public.has_project_access(auth.uid(), project_id))
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

-- Updated_at trigger
CREATE TRIGGER scene_demo_runs_updated_at BEFORE UPDATE ON public.scene_demo_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER scene_demo_images_updated_at BEFORE UPDATE ON public.scene_demo_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
