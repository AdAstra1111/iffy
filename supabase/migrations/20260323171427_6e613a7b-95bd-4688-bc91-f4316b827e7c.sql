
-- Location Visual Datasets: canonical generation-ready visual truth per location
CREATE TABLE IF NOT EXISTS public.location_visual_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  canon_location_id UUID REFERENCES public.canon_locations(id) ON DELETE SET NULL,
  location_name TEXT NOT NULL,
  dataset_version INTEGER NOT NULL DEFAULT 1,
  source_mode TEXT NOT NULL DEFAULT 'reverse_engineered' CHECK (source_mode IN ('reverse_engineered', 'dev_engine_native', 'edited', 'hybrid')),
  provenance JSONB NOT NULL DEFAULT '{}',
  completeness_score NUMERIC(3,2) DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT true,

  -- Parent/child hierarchy
  parent_location_id UUID REFERENCES public.location_visual_datasets(id) ON DELETE SET NULL,
  location_class TEXT NOT NULL DEFAULT 'primary_space' CHECK (location_class IN ('primary_space', 'sub_space', 'workshop', 'storage', 'passage', 'exterior', 'courtyard')),
  inherits_from_parent BOOLEAN NOT NULL DEFAULT false,
  non_inheritable_traits TEXT[] NOT NULL DEFAULT '{}',

  -- Visual Role Layers (structured JSONB for each)
  structural_substrate JSONB NOT NULL DEFAULT '{"primary":[],"secondary":[],"notes":""}',
  surface_condition JSONB NOT NULL DEFAULT '{"primary":[],"secondary":[],"notes":""}',
  atmosphere_behavior JSONB NOT NULL DEFAULT '{"primary":[],"secondary":[],"notes":""}',
  spatial_character JSONB NOT NULL DEFAULT '{"primary":[],"secondary":[],"notes":""}',
  status_signal JSONB NOT NULL DEFAULT '{"primary":[],"secondary":[],"notes":""}',
  contextual_dressing JSONB NOT NULL DEFAULT '{"primary":[],"secondary":[],"notes":""}',
  occupation_trace JSONB NOT NULL DEFAULT '{"primary":[],"secondary":[],"forbidden_as_dominant":true,"notes":""}',
  symbolic_motif JSONB NOT NULL DEFAULT '{"primary":[],"secondary":[],"notes":""}',

  -- Slot-Specific Generation Data
  slot_establishing JSONB NOT NULL DEFAULT '{"primary_truths":[],"secondary_truths":[],"contextual":[],"forbidden_dominance":[],"hard_negatives":[],"notes":""}',
  slot_atmosphere JSONB NOT NULL DEFAULT '{"primary_truths":[],"secondary_truths":[],"contextual":[],"forbidden_dominance":[],"hard_negatives":[],"notes":""}',
  slot_architectural_detail JSONB NOT NULL DEFAULT '{"primary_truths":[],"secondary_truths":[],"contextual":[],"forbidden_dominance":[],"hard_negatives":[],"notes":""}',
  slot_time_variant JSONB NOT NULL DEFAULT '{"primary_truths":[],"secondary_truths":[],"contextual":[],"forbidden_dominance":[],"hard_negatives":[],"notes":""}',
  slot_surface_language JSONB NOT NULL DEFAULT '{"primary_truths":[],"secondary_truths":[],"contextual":[],"forbidden_dominance":[],"hard_negatives":[],"notes":""}',
  slot_motif JSONB NOT NULL DEFAULT '{"primary_truths":[],"secondary_truths":[],"contextual":[],"forbidden_dominance":[],"hard_negatives":[],"notes":""}',

  -- Status expression rules
  status_expression_mode TEXT NOT NULL DEFAULT 'spatial' CHECK (status_expression_mode IN ('spatial', 'material', 'ornamental', 'austere', 'mixed')),
  status_expression_notes TEXT,

  -- Freshness
  freshness_status TEXT NOT NULL DEFAULT 'fresh' CHECK (freshness_status IN ('fresh', 'stale', 'rebuilding')),
  stale_reason TEXT,
  source_canon_hash TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lvd_project ON public.location_visual_datasets(project_id);
CREATE INDEX IF NOT EXISTS idx_lvd_location ON public.location_visual_datasets(canon_location_id);
CREATE INDEX IF NOT EXISTS idx_lvd_current ON public.location_visual_datasets(project_id, is_current) WHERE is_current = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lvd_unique_current ON public.location_visual_datasets(project_id, canon_location_id) WHERE is_current = true AND canon_location_id IS NOT NULL;

-- RLS
ALTER TABLE public.location_visual_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project location datasets"
  ON public.location_visual_datasets FOR SELECT
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can insert own project location datasets"
  ON public.location_visual_datasets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update own project location datasets"
  ON public.location_visual_datasets FOR UPDATE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete own project location datasets"
  ON public.location_visual_datasets FOR DELETE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

-- Updated_at trigger
CREATE TRIGGER set_lvd_updated_at
  BEFORE UPDATE ON public.location_visual_datasets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
