-- Migration: Add review state to execution provenance
-- Purpose: Post-execution quality review for generated visual outputs.
-- Generated assets start pending_review and require human acceptance before
-- they can satisfy downstream preflight requirements.
--
-- Review states:
--   pending_review (default) — generated but not yet reviewed
--   accepted — human approved, satisfies downstream preflight
--   rejected — human rejected, does NOT satisfy downstream preflight
--   needs_revision — flagged for re-execution

ALTER TABLE public.project_visual_execution_provenance
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'pending_review';

ALTER TABLE public.project_visual_execution_provenance
  ADD COLUMN IF NOT EXISTS review_notes text DEFAULT NULL;

ALTER TABLE public.project_visual_execution_provenance
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz DEFAULT NULL;

ALTER TABLE public.project_visual_execution_provenance
  ADD COLUMN IF NOT EXISTS reviewed_by uuid DEFAULT NULL;

-- Add check constraint for valid review states
DO $$ BEGIN
  ALTER TABLE public.project_visual_execution_provenance
    ADD CONSTRAINT chk_review_state
    CHECK (review_state IN ('pending_review', 'accepted', 'rejected', 'needs_revision'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Index for review queries
CREATE INDEX IF NOT EXISTS idx_exec_prov_review
  ON public.project_visual_execution_provenance (project_id, stage_id, review_state);

-- RLS: allow authenticated users to update review state for their projects
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_visual_execution_provenance'
    AND policyname = 'Users can update review state for accessible projects'
  ) THEN
    CREATE POLICY "Users can update review state for accessible projects"
      ON public.project_visual_execution_provenance FOR UPDATE
      TO authenticated
      USING (public.has_project_access(auth.uid(), project_id))
      WITH CHECK (
        public.has_project_access(auth.uid(), project_id)
        AND review_state IN ('pending_review', 'accepted', 'rejected', 'needs_revision')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.project_visual_execution_provenance.review_state IS
  'Human review state: pending_review (default), accepted, rejected, or needs_revision. Accepted outputs satisfy downstream preflight; rejected outputs block downstream preflight.';
COMMENT ON COLUMN public.project_visual_execution_provenance.review_notes IS
  'Optional human-written notes explaining the review decision.';
COMMENT ON COLUMN public.project_visual_execution_provenance.reviewed_at IS
  'Timestamp when the review decision was made.';
COMMENT ON COLUMN public.project_visual_execution_provenance.reviewed_by IS
  'User ID of the reviewer who made the decision.';