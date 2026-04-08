
-- Convergence Runs: top-level orchestration entity
CREATE TABLE IF NOT EXISTS public.convergence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.ai_actors(id) ON DELETE CASCADE,
  actor_version_id uuid NOT NULL REFERENCES public.ai_actor_versions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'exploratory' CHECK (mode IN ('exploratory', 'reference_locked')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'aborted')),
  policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_round integer NOT NULL DEFAULT 0,
  max_rounds integer NOT NULL DEFAULT 5,
  best_candidate_id uuid,
  shortlisted_candidate_ids uuid[] DEFAULT '{}',
  stop_reason text,
  final_recommendation text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Convergence Rounds: each iteration within a run
CREATE TABLE IF NOT EXISTS public.convergence_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.convergence_runs(id) ON DELETE CASCADE,
  round_number integer NOT NULL DEFAULT 1,
  stage text NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending', 'generating', 'validating', 'scoring', 'selecting', 'refining', 'complete', 'failed')),
  strategy text NOT NULL DEFAULT 'exploratory_wide',
  refinement_plan jsonb DEFAULT '{}'::jsonb,
  generation_count integer NOT NULL DEFAULT 3,
  keeper_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  best_score numeric,
  avg_score numeric,
  improvement_delta numeric,
  stop_eligible boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, round_number)
);

-- Convergence Candidates: individual candidates within a round
CREATE TABLE IF NOT EXISTS public.convergence_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.convergence_rounds(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.convergence_runs(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.ai_actor_assets(id) ON DELETE SET NULL,
  candidate_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'generated', 'validating', 'scoring', 'scored', 'keeper', 'rejected', 'promoted', 'failed')),
  score numeric,
  score_band text,
  axis_scores jsonb DEFAULT '{}'::jsonb,
  hard_fail_codes text[] DEFAULT '{}',
  advisory_codes text[] DEFAULT '{}',
  rank_position integer,
  selection_status text DEFAULT 'pending' CHECK (selection_status IN ('pending', 'keeper', 'rejected', 'promoted', 'branch')),
  selection_rationale text,
  refinement_fitness jsonb DEFAULT '{}'::jsonb,
  generation_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Convergence Events: audit trail
CREATE TABLE IF NOT EXISTS public.convergence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.convergence_runs(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.convergence_rounds(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_convergence_runs_actor ON public.convergence_runs(actor_id);
CREATE INDEX IF NOT EXISTS idx_convergence_runs_user ON public.convergence_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_convergence_rounds_run ON public.convergence_rounds(run_id);
CREATE INDEX IF NOT EXISTS idx_convergence_candidates_round ON public.convergence_candidates(round_id);
CREATE INDEX IF NOT EXISTS idx_convergence_candidates_run ON public.convergence_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_convergence_events_run ON public.convergence_events(run_id);

-- RLS
ALTER TABLE public.convergence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convergence_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convergence_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convergence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own convergence runs" ON public.convergence_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users access own convergence rounds" ON public.convergence_rounds
  FOR ALL TO authenticated
  USING (run_id IN (SELECT id FROM public.convergence_runs WHERE user_id = auth.uid()))
  WITH CHECK (run_id IN (SELECT id FROM public.convergence_runs WHERE user_id = auth.uid()));

CREATE POLICY "Users access own convergence candidates" ON public.convergence_candidates
  FOR ALL TO authenticated
  USING (run_id IN (SELECT id FROM public.convergence_runs WHERE user_id = auth.uid()))
  WITH CHECK (run_id IN (SELECT id FROM public.convergence_runs WHERE user_id = auth.uid()));

CREATE POLICY "Users access own convergence events" ON public.convergence_events
  FOR ALL TO authenticated
  USING (run_id IN (SELECT id FROM public.convergence_runs WHERE user_id = auth.uid()))
  WITH CHECK (run_id IN (SELECT id FROM public.convergence_runs WHERE user_id = auth.uid()));

-- Updated_at trigger
CREATE TRIGGER set_convergence_runs_updated_at BEFORE UPDATE ON public.convergence_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_convergence_candidates_updated_at BEFORE UPDATE ON public.convergence_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
