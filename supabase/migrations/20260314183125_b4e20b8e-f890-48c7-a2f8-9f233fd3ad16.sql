
ALTER TABLE public.execution_recommendation_triage
  ADD COLUMN IF NOT EXISTS comparison_key text;

CREATE INDEX IF NOT EXISTS idx_exec_rec_triage_compkey
  ON public.execution_recommendation_triage(project_id, comparison_key);
