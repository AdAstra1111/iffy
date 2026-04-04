
-- Add canonical flag to scene_demo_runs
ALTER TABLE public.scene_demo_runs
  ADD COLUMN IF NOT EXISTS is_canonical boolean NOT NULL DEFAULT false;

-- Partial unique index: at most one canonical run per scene per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_demo_runs_canonical_unique
  ON public.scene_demo_runs (project_id, scene_id)
  WHERE is_canonical = true;
