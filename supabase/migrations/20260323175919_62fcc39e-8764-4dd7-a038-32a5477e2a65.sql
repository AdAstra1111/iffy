
-- Character Visual Datasets — canonical visual identity truth for AI performers
CREATE TABLE IF NOT EXISTS public.character_visual_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  canonical_character_id uuid,
  ai_actor_id uuid REFERENCES public.ai_actors(id) ON DELETE SET NULL,
  dataset_version integer NOT NULL DEFAULT 1,
  canonical_name text NOT NULL,
  source_mode text NOT NULL DEFAULT 'reverse_engineered',
  provenance jsonb NOT NULL DEFAULT '{}',
  completeness_score numeric(3,2) NOT NULL DEFAULT 0,
  is_current boolean NOT NULL DEFAULT true,
  freshness_status text NOT NULL DEFAULT 'fresh',
  stale_reason text,
  source_canon_hash text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Identity / classification
  identity_type text NOT NULL DEFAULT 'character',
  age_band text,
  sex_gender_presentation text,
  ethnicity_ancestry_expression text,
  cultural_context text,
  beauty_mode text,
  casting_labels text[] NOT NULL DEFAULT '{}',
  reusable_scope text NOT NULL DEFAULT 'project',

  -- Truth model JSON blocks
  identity_core jsonb NOT NULL DEFAULT '{}',
  proportion_silhouette jsonb NOT NULL DEFAULT '{}',
  surface_identity jsonb NOT NULL DEFAULT '{}',
  presence_behavior jsonb NOT NULL DEFAULT '{}',
  lighting_response jsonb NOT NULL DEFAULT '{}',
  styling_affinity jsonb NOT NULL DEFAULT '{}',
  narrative_read jsonb NOT NULL DEFAULT '{}',

  -- Control model JSON blocks
  identity_invariants jsonb NOT NULL DEFAULT '{}',
  allowed_variation jsonb NOT NULL DEFAULT '{}',
  forbidden_drift jsonb NOT NULL DEFAULT '{}',
  anti_confusion jsonb NOT NULL DEFAULT '{}',
  validation_requirements jsonb NOT NULL DEFAULT '{}',

  -- Slot blocks
  slot_portrait jsonb NOT NULL DEFAULT '{}',
  slot_profile jsonb NOT NULL DEFAULT '{}',
  slot_three_quarter jsonb NOT NULL DEFAULT '{}',
  slot_full_body jsonb NOT NULL DEFAULT '{}',
  slot_expression jsonb NOT NULL DEFAULT '{}',
  slot_lighting_response jsonb NOT NULL DEFAULT '{}'
);

-- Unique current-row protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_cvd_unique_current
  ON public.character_visual_datasets (project_id, canonical_name)
  WHERE is_current = true;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_cvd_project ON public.character_visual_datasets (project_id);
CREATE INDEX IF NOT EXISTS idx_cvd_actor ON public.character_visual_datasets (ai_actor_id) WHERE ai_actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cvd_current ON public.character_visual_datasets (project_id, is_current) WHERE is_current = true;

-- Auto-update updated_at
CREATE TRIGGER set_cvd_updated_at
  BEFORE UPDATE ON public.character_visual_datasets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.character_visual_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own project character datasets"
  ON public.character_visual_datasets FOR SELECT
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can insert own project character datasets"
  ON public.character_visual_datasets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update own project character datasets"
  ON public.character_visual_datasets FOR UPDATE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));
