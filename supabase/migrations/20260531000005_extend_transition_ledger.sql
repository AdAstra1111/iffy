-- Migration M4: Extend Pipeline Transitions for Patch Events
-- Adds patch_plan_id FK to pipeline_transitions and creates patch event types
-- Per PPE-034: pipeline_transitions = provenance store for patch operations
-- Per Task 6 in the execution brief: TransitionLedger.ts extension + patch event types
-- Part of PPE Phase 0A: Audience Effect Extraction

BEGIN;

-- ── 1. Add patch_plan_id to pipeline_transitions ──

ALTER TABLE public.pipeline_transitions
  ADD COLUMN IF NOT EXISTS patch_plan_id UUID REFERENCES public.patch_plans(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pipeline_transitions.patch_plan_id IS 'FK to patch_plans for tracking patch execution provenance';

CREATE INDEX IF NOT EXISTS idx_pipeline_transitions_patch_plan
  ON public.pipeline_transitions(patch_plan_id) WHERE patch_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_transitions_extraction
  ON public.pipeline_transitions(event_type, created_at DESC)
  WHERE event_type IN ('extraction_completed', 'extraction_failed');

-- ── 2. Prevent removal of existing immutable trigger (just ensure it exists) ──
-- The immutable trigger already exists from the original migration (20260307005059).
-- We do NOT modify or replace it — pipeline_transitions remains append-only.

COMMIT;