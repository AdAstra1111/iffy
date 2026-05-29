-- Migration M2: Patch Planning System
-- Creates patch_plans and patch_operations tables (schema only — Phase 1 will use them)
-- Part of PPE Phase 0A: Audience Effect Extraction

BEGIN;

-- ── 1. patch_plans — Surgical narrative patch plans ──

CREATE TABLE IF NOT EXISTS public.patch_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_note_id  UUID REFERENCES public.project_notes(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'planned', 'executing', 'completed', 'failed', 'reverted')),
  plan_type       TEXT NOT NULL
                    CHECK (plan_type IN ('audience_correction', 'continuity_fix', 'consistency_update', 'targeted_edit', 'dimension_tune')),
  target_doc_type TEXT,

  -- The overall plan structure
  plan_json       JSONB DEFAULT '{}'::jsonb,

  -- Outcome data (demoted from separate patch_outcomes table to JSONB per PPE-033)
  -- Structure: { success, applied_operations, failed_operations, 
  --              intended_state, achieved_state, validation_result }
  outcome         JSONB DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.patch_plans IS 'Surgical narrative patch plans targeting specific beats. Schema only in Phase 0A — populated in Phase 1.';
COMMENT ON COLUMN public.patch_plans.outcome IS 'Patch execution outcome. Demoted from separate patch_outcomes table to JSONB on patch_plans per PPE-033 decision.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patch_plans_project
  ON public.patch_plans(project_id);

CREATE INDEX IF NOT EXISTS idx_patch_plans_status
  ON public.patch_plans(status);

CREATE INDEX IF NOT EXISTS idx_patch_plans_note
  ON public.patch_plans(source_note_id) WHERE source_note_id IS NOT NULL;

-- RLS
ALTER TABLE public.patch_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view patch plans for accessible projects"
  ON public.patch_plans FOR SELECT
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can insert patch plans for accessible projects"
  ON public.patch_plans FOR INSERT
  TO authenticated
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update patch plans for accessible projects"
  ON public.patch_plans FOR UPDATE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

-- Updated_at trigger
CREATE TRIGGER set_patch_plans_updated_at
  BEFORE UPDATE ON public.patch_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. patch_operations — Individual operations within a patch plan ──

CREATE TABLE IF NOT EXISTS public.patch_operations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_plan_id   UUID NOT NULL REFERENCES public.patch_plans(id) ON DELETE CASCADE,
  unit_id         UUID REFERENCES public.narrative_units(id) ON DELETE SET NULL,
  chunk_id        UUID REFERENCES public.project_document_chunks(id) ON DELETE SET NULL,
  operation_type  TEXT NOT NULL
                    CHECK (operation_type IN ('modify', 'insert', 'delete', 'replace', 'tune')),
  target_field    TEXT,
  old_value       JSONB,
  new_value       JSONB,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'applied', 'skipped', 'failed', 'reverted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.patch_operations IS 'Individual operations within a patch plan. Schema only in Phase 0A — populated in Phase 1.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patch_operations_plan
  ON public.patch_operations(patch_plan_id);

CREATE INDEX IF NOT EXISTS idx_patch_operations_unit
  ON public.patch_operations(unit_id) WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patch_operations_chunk
  ON public.patch_operations(chunk_id) WHERE chunk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patch_operations_status
  ON public.patch_operations(status);

-- RLS
ALTER TABLE public.patch_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view patch operations via plan access"
  ON public.patch_operations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patch_plans pp
      WHERE pp.id = patch_plan_id
      AND public.has_project_access(auth.uid(), pp.project_id)
    )
  );

CREATE POLICY "Users can insert patch operations via plan access"
  ON public.patch_operations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patch_plans pp
      WHERE pp.id = patch_plan_id
      AND public.has_project_access(auth.uid(), pp.project_id)
    )
  );

CREATE POLICY "Users can update patch operations via plan access"
  ON public.patch_operations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patch_plans pp
      WHERE pp.id = patch_plan_id
      AND public.has_project_access(auth.uid(), pp.project_id)
    )
  );

-- Updated_at trigger
CREATE TRIGGER set_patch_operations_updated_at
  BEFORE UPDATE ON public.patch_operations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;