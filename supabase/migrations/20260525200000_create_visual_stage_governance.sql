-- Migration: Create project_visual_stage_governance table
-- Purpose: Server-side persistence for visual pipeline governance state.
--           Each row represents one visual stage's governance snapshot.
--           Writes only — no generation triggers, no auto-run.
--
-- Schema decision (Option A from P2 analysis):
--   A. New dedicated table — chosen (clean, typed, RLS-capable, no domain pollution)
--   B. projects.pipeline_state JSONB — rejected (already claimed by production stills pipeline)
--   C. Existing visual tables — rejected (governance spans 5+ tables)

CREATE TABLE IF NOT EXISTS public.project_visual_stage_governance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  computed_status text NOT NULL,
  eligibility_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  stale_risk jsonb DEFAULT NULL,
  blocker_codes text[] DEFAULT NULL,
  provenance_json jsonb DEFAULT NULL,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  source_snapshot_hash text NOT NULL,

  UNIQUE(project_id, stage_id)
);

COMMENT ON TABLE public.project_visual_stage_governance IS
  'Server-side visual governance snapshots. Read-only for governance visibility — does NOT trigger visual generation or auto-run.';
COMMENT ON COLUMN public.project_visual_stage_governance.stage_id IS
  'Visual pipeline stage name: source_truth, visual_canon, cast, hero_frames, production_design, visual_language, poster, concept_brief, lookbook';
COMMENT ON COLUMN public.project_visual_stage_governance.computed_status IS
  'Stage status at evaluation time: not_started, in_progress, ready_for_review, approved, locked, stale, blocked';
COMMENT ON COLUMN public.project_visual_stage_governance.eligibility_state IS
  'JSON: {eligible: bool, reason?: string, completed_prereqs: string[], blocked_prereqs: string[]}';
COMMENT ON COLUMN public.project_visual_stage_governance.stale_risk IS
  'JSON: {isStale: bool, reasons: [{label: string, detail: string, severity: low|medium|high}]}';
COMMENT ON COLUMN public.project_visual_stage_governance.blocker_codes IS
  'Array of human-readable blocker reasons, e.g. ["Requires source truth", "Requires cast locked"]';
COMMENT ON COLUMN public.project_visual_stage_governance.provenance_json IS
  'JSON: {sourceType: string, sourceDetail?: string, generatedAsset?: string, functionName?: string}';
COMMENT ON COLUMN public.project_visual_stage_governance.source_snapshot_hash IS
  'Deterministic SHA256 hex digest of all inputs used to compute this governance state. Enables change detection.';

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS idx_visual_governance_project
  ON public.project_visual_stage_governance (project_id);

CREATE INDEX IF NOT EXISTS idx_visual_governance_project_stage
  ON public.project_visual_stage_governance (project_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_visual_governance_evaluated
  ON public.project_visual_stage_governance (last_evaluated_at);

-- ── Row-Level Security ──

ALTER TABLE public.project_visual_stage_governance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_visual_stage_governance' AND policyname = 'Users can view governance for accessible projects'
  ) THEN
    CREATE POLICY "Users can view governance for accessible projects"
      ON public.project_visual_stage_governance FOR SELECT
      TO authenticated
      USING (public.has_project_access(auth.uid(), project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_visual_stage_governance' AND policyname = 'Service role can insert governance snapshots'
  ) THEN
    CREATE POLICY "Service role can insert governance snapshots"
      ON public.project_visual_stage_governance FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_visual_stage_governance' AND policyname = 'Service role can update governance snapshots'
  ) THEN
    CREATE POLICY "Service role can update governance snapshots"
      ON public.project_visual_stage_governance FOR UPDATE
      TO service_role
      USING (true);
  END IF;
END $$;

-- ── Auto-update updated_at trigger ──

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_visual_governance_updated_at'
  ) THEN
    CREATE TRIGGER set_visual_governance_updated_at
      BEFORE UPDATE ON public.project_visual_stage_governance
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Notify: no storage buckets, no cron jobs, no auto-run triggers.
-- This table is written ONLY by the evaluate-visual-governance edge function.