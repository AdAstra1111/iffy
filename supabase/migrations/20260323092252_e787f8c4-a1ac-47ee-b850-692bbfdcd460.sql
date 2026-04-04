
-- Add scoring provenance columns to convergence_candidates
-- These persist full evaluation context for auditability

ALTER TABLE public.convergence_candidates
  ADD COLUMN IF NOT EXISTS evaluation_mode text DEFAULT 'exploratory',
  ADD COLUMN IF NOT EXISTS evaluated_against text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scoring_model text,
  ADD COLUMN IF NOT EXISTS scoring_prompt_version text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS raw_evaluation_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence text DEFAULT 'medium';

-- Add evaluation_reference_policy to convergence_rounds
ALTER TABLE public.convergence_rounds
  ADD COLUMN IF NOT EXISTS evaluation_reference_policy text DEFAULT 'canonical_anchors',
  ADD COLUMN IF NOT EXISTS evaluation_mode text DEFAULT 'exploratory',
  ADD COLUMN IF NOT EXISTS reference_ids text[] DEFAULT '{}';
