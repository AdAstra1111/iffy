-- Migration: Create project_visual_execution_provenance table
-- Purpose: Immutable execution history for visual repair intent executions.
-- Each row is append-only — never overwritten.
-- Links repair intents to generated assets with full provenance.

CREATE TABLE IF NOT EXISTS public.project_visual_execution_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  repair_intent_id uuid NOT NULL REFERENCES public.project_visual_repair_intents(id) ON DELETE CASCADE,
  execution_number integer NOT NULL,
  stage_id text NOT NULL,
  recommended_action text NOT NULL,
  execution_state text NOT NULL,

  -- Governance/hash snapshots at time of execution
  governance_snapshot_hash text,
  stale_reason_snapshot jsonb DEFAULT NULL,
  generation_input_hash text DEFAULT NULL,
  generated_asset_ids text[] DEFAULT NULL,
  previous_asset_ids text[] DEFAULT NULL,

  -- Rollback relationship
  previous_execution_id uuid DEFAULT NULL,
  is_superseded boolean NOT NULL DEFAULT false,
  superseded_at timestamptz DEFAULT NULL,

  -- Execution metadata
  result_summary jsonb DEFAULT NULL,
  error_message text DEFAULT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(project_id, execution_number)
);

COMMENT ON TABLE public.project_visual_execution_provenance IS
  'Immutable execution history for visual repair intent executions. Append-only — each execution creates a new row. Provides lineage tracking for generated visual assets.';
COMMENT ON COLUMN public.project_visual_execution_provenance.execution_number IS
  'Sequential execution number per project (1, 2, 3...). Enables ordered timeline display.';
COMMENT ON COLUMN public.project_visual_execution_provenance.governance_snapshot_hash IS
  'The source_snapshot_hash from evaluate-visual-governance at time of execution.';
COMMENT ON COLUMN public.project_visual_execution_provenance.generation_input_hash IS
  'Deterministic hash of the input payload sent to the generation edge function.';
COMMENT ON COLUMN public.project_visual_execution_provenance.generated_asset_ids IS
  'Array of asset IDs produced by this execution (e.g., poster_candidate IDs).';
COMMENT ON COLUMN public.project_visual_execution_provenance.previous_asset_ids IS
  'Array of asset IDs that were superseded by this execution.';
COMMENT ON COLUMN public.project_visual_execution_provenance.previous_execution_id IS
  'UUID of the previous execution for the same stage, if any. Enables rollback chain.';
COMMENT ON COLUMN public.project_visual_execution_provenance.is_superseded IS
  'True when a newer execution has replaced this one for the same stage.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exec_prov_project ON public.project_visual_execution_provenance (project_id);
CREATE INDEX IF NOT EXISTS idx_exec_prov_intent ON public.project_visual_execution_provenance (repair_intent_id);
CREATE INDEX IF NOT EXISTS idx_exec_prov_stage ON public.project_visual_execution_provenance (project_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_exec_prov_superseded ON public.project_visual_execution_provenance (project_id, is_superseded);

-- RLS
ALTER TABLE public.project_visual_execution_provenance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_visual_execution_provenance' AND policyname = 'Users can view execution provenance for accessible projects') THEN
    CREATE POLICY "Users can view execution provenance for accessible projects"
      ON public.project_visual_execution_provenance FOR SELECT
      TO authenticated
      USING (public.has_project_access(auth.uid(), project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_visual_execution_provenance' AND policyname = 'Service role can insert execution provenance') THEN
    CREATE POLICY "Service role can insert execution provenance"
      ON public.project_visual_execution_provenance FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

-- Sequence function for execution_number
CREATE OR REPLACE FUNCTION public.next_execution_number(p_project_id uuid)
RETURNS integer AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(execution_number), 0) + 1 INTO next_num
  FROM public.project_visual_execution_provenance
  WHERE project_id = p_project_id;
  RETURN next_num;
END;
$$ LANGUAGE plpgsql STABLE;