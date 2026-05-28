-- Graph Mutation Pipeline Phase 1: mutation_proposals table
-- Tracks proposed graph mutations that require human review before application.

CREATE TABLE IF NOT EXISTS public.graph_mutation_proposals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id          UUID        NULL,
  source_note_id  TEXT        NULL,
  mutation_type   TEXT        NOT NULL DEFAULT 'add_entity',
  entity_type     TEXT        NOT NULL DEFAULT 'character',
  proposal_json   JSONB       NOT NULL,
  proposal_status TEXT        NOT NULL DEFAULT 'pending',
  review_comment  TEXT        NULL,
  created_at      TIMESTAMPTZ NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ NULL,
  applied_at      TIMESTAMPTZ NULL,
  error_log       TEXT        NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_gmp_project_id        ON public.graph_mutation_proposals (project_id);
CREATE INDEX IF NOT EXISTS idx_gmp_proposal_status   ON public.graph_mutation_proposals (proposal_status);
CREATE INDEX IF NOT EXISTS idx_gmp_mutation_type     ON public.graph_mutation_proposals (mutation_type);

-- Row Level Security
ALTER TABLE public.graph_mutation_proposals ENABLE ROW LEVEL SECURITY;

-- Policies: gmp_select, gmp_insert, gmp_update using has_project_access()
CREATE POLICY gmp_select ON public.graph_mutation_proposals
  FOR SELECT
  USING (has_project_access(auth.uid(), project_id));

CREATE POLICY gmp_insert ON public.graph_mutation_proposals
  FOR INSERT
  WITH CHECK (has_project_access(auth.uid(), project_id));

CREATE POLICY gmp_update ON public.graph_mutation_proposals
  FOR UPDATE
  USING (has_project_access(auth.uid(), project_id));