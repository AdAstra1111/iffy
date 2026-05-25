-- Migration: Create project_visual_repair_intents table
-- Purpose: Explicitly tracked repair operations for stale visual stages.
-- Intents are created by user action, store proposed operations, and
-- require human approval before execution.
--
-- SEPARATION OF CONCERNS:
-- - Stale detection (governance) RECOMMENDS but does not execute
-- - Repair intents are EXPLICITLY created by user action
-- - Execution is gated on human APPROVAL
-- - No auto-run, no automatic generation, no silent mutation

CREATE TABLE IF NOT EXISTS public.project_visual_repair_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  stale_reason_codes text[] NOT NULL DEFAULT '{}',
  recommended_action text NOT NULL,
  intent_label text,
  intent_detail text,
  created_by uuid NOT NULL,
  approval_state text NOT NULL DEFAULT 'pending'
    CHECK (approval_state IN ('pending', 'approved', 'rejected', 'cancelled')),
  execution_state text NOT NULL DEFAULT 'queued'
    CHECK (execution_state IN ('queued', 'ready', 'blocked', 'completed', 'failed')),
  provenance_snapshot jsonb DEFAULT NULL,
  downstream_stages text[] DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz DEFAULT NULL,
  approved_by uuid DEFAULT NULL,
  executed_at timestamptz DEFAULT NULL,
  rejection_reason text DEFAULT NULL,

  UNIQUE(project_id, stage_id, recommended_action)
);

COMMENT ON TABLE public.project_visual_repair_intents IS
  'Explicitly created visual repair intents. Created by user action — never auto-generated. Each intent proposes one repair operation for one visual stage.';
COMMENT ON COLUMN public.project_visual_repair_intents.stale_reason_codes IS
  'The stale reason codes that triggered this repair intent, e.g. {"CANON_NEWER_THAN_STAGE","DOC_VERSION_CHANGED"}';
COMMENT ON COLUMN public.project_visual_repair_intents.recommended_action IS
  'The proposed action: REVIEW_ONLY, REFRESH_GOVERNANCE, REGENERATE_CANDIDATES, REBUILD_STAGE, LOCKED_REVIEW_REQUIRED';
COMMENT ON COLUMN public.project_visual_repair_intents.approval_state IS
  'Human approval state: pending → approved/rejected/cancelled. No automatic transitions.';
COMMENT ON COLUMN public.project_visual_repair_intents.execution_state IS
  'Execution state: queued → ready/blocked → completed/failed. Placeholder — actual execution is NOT implemented.';
COMMENT ON COLUMN public.project_visual_repair_intents.provenance_snapshot IS
  'Snapshot of the provenance data at intent creation time. JSON: {sourceType, sourceDetail, generatedAsset, functionName}';
COMMENT ON COLUMN public.project_visual_repair_intents.downstream_stages IS
  'Array of downstream stage IDs that would be affected if this intent is executed.';

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS idx_repair_intents_project
  ON public.project_visual_repair_intents (project_id);

CREATE INDEX IF NOT EXISTS idx_repair_intents_project_stage
  ON public.project_visual_repair_intents (project_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_repair_intents_approval
  ON public.project_visual_repair_intents (project_id, approval_state);

-- ── Row-Level Security ──

ALTER TABLE public.project_visual_repair_intents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_visual_repair_intents' AND policyname = 'Users can view repair intents for accessible projects'
  ) THEN
    CREATE POLICY "Users can view repair intents for accessible projects"
      ON public.project_visual_repair_intents FOR SELECT
      TO authenticated
      USING (public.has_project_access(auth.uid(), project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_visual_repair_intents' AND policyname = 'Users can create repair intents for accessible projects'
  ) THEN
    CREATE POLICY "Users can create repair intents for accessible projects"
      ON public.project_visual_repair_intents FOR INSERT
      TO authenticated
      WITH CHECK (public.has_project_access(auth.uid(), project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_visual_repair_intents' AND policyname = 'Users can update their own repair intents'
  ) THEN
    CREATE POLICY "Users can update their own repair intents"
      ON public.project_visual_repair_intents FOR UPDATE
      TO authenticated
      USING (auth.uid() = created_by);
  END IF;
END $$;

-- ── Auto-update trigger ──

CREATE OR REPLACE FUNCTION public.update_repair_intent_timestamps()
RETURNS trigger AS $$
BEGIN
  -- Set approved_at when approval_state changes to 'approved'
  IF NEW.approval_state = 'approved' AND OLD.approval_state != 'approved' THEN
    NEW.approved_at = now();
    NEW.approved_by = auth.uid();
  END IF;
  -- Set executed_at when execution_state changes to 'completed' or 'failed'
  IF NEW.execution_state IN ('completed', 'failed') AND OLD.execution_state NOT IN ('completed', 'failed') THEN
    NEW.executed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_repair_intent_timestamps'
  ) THEN
    CREATE TRIGGER set_repair_intent_timestamps
      BEFORE UPDATE ON public.project_visual_repair_intents
      FOR EACH ROW EXECUTE FUNCTION public.update_repair_intent_timestamps();
  END IF;
END $$;

-- Notify: no storage buckets, no cron jobs, no auto-run triggers.
-- This table is written ONLY by user-facing edge functions and direct user action.