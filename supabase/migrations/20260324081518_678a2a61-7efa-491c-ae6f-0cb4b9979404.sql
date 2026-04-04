
-- Add convergence scoring columns to visual_set_slots
ALTER TABLE public.visual_set_slots
  ADD COLUMN IF NOT EXISTS best_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_candidate_id uuid,
  ADD COLUMN IF NOT EXISTS convergence_state jsonb DEFAULT '{}'::jsonb;

-- Add scoring columns to visual_set_candidates
ALTER TABLE public.visual_set_candidates
  ADD COLUMN IF NOT EXISTS convergence_scores jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hard_fail boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fail_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prompt_used text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS model_metadata jsonb DEFAULT NULL;
