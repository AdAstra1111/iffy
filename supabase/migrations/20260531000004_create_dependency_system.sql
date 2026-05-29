-- Migration M3: Narrative Dependencies
-- Creates narrative_dependencies table — instance-level dependency store between narrative units
-- Per PPE-036: NDG is axis-level rules layer; narrative_dependencies fills the beat-level gap
-- Per PPE-035: Beat-level deps need separate table (NDG is axis-level)
-- Per PPE-034: NDG is sole dependency authority; narrative_dependencies is the instance layer
-- Part of PPE Phase 0A: Audience Effect Extraction

BEGIN;

-- ── 1. narrative_dependencies — Instance-level beat dependency store ──

CREATE TABLE IF NOT EXISTS public.narrative_dependencies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_unit_id    UUID NOT NULL REFERENCES public.narrative_units(id) ON DELETE CASCADE,
  target_unit_id    UUID NOT NULL REFERENCES public.narrative_units(id) ON DELETE CASCADE,
  dependency_type   TEXT NOT NULL
                      CHECK (dependency_type IN (
                        'causal',           -- beat A causes beat B
                        'temporal',         -- beat A precedes beat B
                        'emotional_chain',  -- audience emotion transitions from A to B
                        'character_arc',    -- character development flows A → B
                        'thematic_link',    -- shared theme between A and B
                        'plot_necessity',   -- B depends on information established in A
                        'genre_expectation',-- A sets up genre payoff in B
                        'continuity',       -- A and B share continuity (time/place/object)
                        'setup_payoff'      -- A is setup, B is payoff
                      )),
  strength          NUMERIC NOT NULL DEFAULT 0.5
                      CHECK (strength >= 0 AND strength <= 1.0),
  meta_json         JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, source_unit_id, target_unit_id, dependency_type)
);

COMMENT ON TABLE public.narrative_dependencies IS 'Instance-level dependency store for beat-level narrative unit dependencies. NDG provides axis-level rules; this table provides instance-level edges. Per PPE-036 settled decision.';
COMMENT ON COLUMN public.narrative_dependencies.dependency_type IS 'Type of dependency: causal, temporal, emotional_chain, character_arc, thematic_link, plot_necessity, genre_expectation, continuity, setup_payoff';
COMMENT ON COLUMN public.narrative_dependencies.strength IS 'Dependency strength 0.0–1.0. Higher = stronger coupling between units.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_narrative_deps_project
  ON public.narrative_dependencies(project_id);

CREATE INDEX IF NOT EXISTS idx_narrative_deps_source
  ON public.narrative_dependencies(source_unit_id);

CREATE INDEX IF NOT EXISTS idx_narrative_deps_target
  ON public.narrative_dependencies(target_unit_id);

CREATE INDEX IF NOT EXISTS idx_narrative_deps_type
  ON public.narrative_dependencies(dependency_type);

CREATE INDEX IF NOT EXISTS idx_narrative_deps_project_strength
  ON public.narrative_dependencies(project_id, strength DESC);

-- RLS
ALTER TABLE public.narrative_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view narrative deps for accessible projects"
  ON public.narrative_dependencies FOR SELECT
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can insert narrative deps for accessible projects"
  ON public.narrative_dependencies FOR INSERT
  TO authenticated
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update narrative deps for accessible projects"
  ON public.narrative_dependencies FOR UPDATE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete narrative deps for accessible projects"
  ON public.narrative_dependencies FOR DELETE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

-- Updated_at trigger
CREATE TRIGGER set_narrative_dependencies_updated_at
  BEFORE UPDATE ON public.narrative_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;