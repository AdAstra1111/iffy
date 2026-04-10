-- Migration: Add source column to development_runs for reconciliation tracking
-- Authoritative store = development_runs; meta_json in project_document_versions = cache
-- Source values: NULL = live run, 'pre-reconciliation_baseline' = backfill

ALTER TABLE public.development_runs
  ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

COMMENT ON COLUMN public.development_runs.source IS 'run_source: NULL=live_convergence_run, pre-reconciliation_baseline=backfill from meta_json';

-- Index for fast source filtering
CREATE INDEX IF NOT EXISTS idx_dev_runs_source ON public.development_runs(source);

-- Unique constraint: one baseline per document (enforce single baseline row)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_runs_one_baseline_per_doc
  ON public.development_runs(document_id)
  WHERE source = 'pre-reconciliation_baseline';
