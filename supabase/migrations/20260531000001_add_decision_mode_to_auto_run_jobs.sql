-- Decision Autonomy Architecture: add decision_mode column to auto_run_jobs
-- DEFAULT 'strict' preserves backward compatibility for existing jobs

ALTER TABLE public.auto_run_jobs
  ADD COLUMN IF NOT EXISTS decision_mode text NOT NULL DEFAULT 'strict'
  CHECK (decision_mode IN ('strict', 'autonomous'));

COMMENT ON COLUMN public.auto_run_jobs.decision_mode IS 'Controls how workflow decisions are handled: strict (default) pauses for user input, autonomous auto-resolves advisory/informational decisions';