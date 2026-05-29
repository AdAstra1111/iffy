-- Migration M1: Audience Effect System
-- Creates audience_dimensions (registry) and audience_state_snapshots (extraction store)
-- Part of PPE Phase 0A: Audience Effect Extraction

BEGIN;

-- ── 1. audience_dimensions — Registry of audience effect dimensions ──

CREATE TABLE IF NOT EXISTS public.audience_dimensions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_key   TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audience_dimensions IS 'Registry of audience effect dimensions for surgical narrative patching (PPE Phase 0A). Each dimension represents a measurable axis of audience experience.';
COMMENT ON COLUMN public.audience_dimensions.dimension_key IS 'Canonical key used in extraction payloads (e.g. emotional_journey, character_empathy)';
COMMENT ON COLUMN public.audience_dimensions.category IS 'Grouping category: engagement, character, drama, meaning, structure';

-- Seed the 10 MVP audience dimensions (settled per PPE-041 Task 3)
INSERT INTO public.audience_dimensions (dimension_key, name, description, category, display_order) VALUES
  ('emotional_journey',       'Emotional Journey',     'The emotional arc of the narrative — joy, sorrow, fear, hope across beats',            'engagement', 1),
  ('character_empathy',       'Character Empathy',     'How much the audience empathizes with characters and their struggles',                   'character',  2),
  ('tension_suspense',        'Tension & Suspense',    'Level of dramatic tension, suspense, and uncertainty maintained',                          'drama',      3),
  ('thematic_resonance',      'Thematic Resonance',    'Clarity, power, and coherence of thematic content and subtext',                            'meaning',    4),
  ('pacing_momentum',         'Pacing & Momentum',     'Narrative pacing — forward momentum vs. drag, rhythm of scenes',                          'structure',  5),
  ('character_arc_coherence', 'Character Arc Coherence', 'Coherence and progression of character development across beats',                        'character',  6),
  ('plot_clarity',            'Plot Clarity',           'How clearly the plot, stakes, and cause-effect chain are communicated',                   'structure',  7),
  ('genre_contract',          'Genre Contract',         'Adherence to genre expectations and conventions (audience trust)',                        'structure',  8),
  ('prediction_outcome',      'Prediction/Outcome',     'Surprise vs. expected outcomes — how well the narrative subverts or satisfies predictions', 'drama',      9),
  ('immersion',               'Immersion',              'Audience immersion, believability, and suspension of disbelief',                          'engagement', 10)
ON CONFLICT (dimension_key) DO NOTHING;

-- RLS: read-only for authenticated users (dimensions are reference data)
ALTER TABLE public.audience_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read audience dimensions"
  ON public.audience_dimensions FOR SELECT
  TO authenticated
  USING (true);

-- ── 2. audience_state_snapshots — Per-chunk audience effect extraction store ──

CREATE TABLE IF NOT EXISTS public.audience_state_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES public.project_documents(id) ON DELETE CASCADE,
  chunk_id        UUID NOT NULL REFERENCES public.project_document_chunks(id) ON DELETE CASCADE,
  version_id      UUID REFERENCES public.project_document_versions(id) ON DELETE SET NULL,

  -- Extracted audience effects array
  -- Each element: { dimension_key, target, target_type, val, contribution, 
  --                 model_confidence, context_confidence, extraction_confidence, final_confidence,
  --                 evidence_excerpt, extraction_version, prompt_version, model, timestamp }
  audience_effects JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Extraction metadata
  extraction_version TEXT NOT NULL DEFAULT '1.0.0',
  prompt_version     TEXT NOT NULL DEFAULT '1.0.0',
  model              TEXT,
  extraction_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Confidence summary
  avg_confidence      NUMERIC,
  effect_count        INTEGER NOT NULL DEFAULT 0,

  -- Human validation overrides (persists across re-extractions)
  -- Structure: { validated_by, validated_at, status: 'correct'|'incorrect'|'partial',
  --              corrections: [{effect_index, field, old_value, new_value}], notes }
  human_validation    JSONB DEFAULT '{}'::jsonb,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, chunk_id, version_id)
);

COMMENT ON TABLE public.audience_state_snapshots IS 'Stores extracted audience effects per chunk with full provenance and human override support (PPE Phase 0A)';
COMMENT ON COLUMN public.audience_state_snapshots.audience_effects IS 'Array of audience effect objects, each storing CONTRIBUTION signals (not absolute state) with composite confidence and provenance';
COMMENT ON COLUMN public.audience_state_snapshots.human_validation IS 'Human override data that persists across re-extractions: { validated_by, validated_at, status, corrections, notes }';

-- Indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_audience_snapshots_project
  ON public.audience_state_snapshots(project_id);

CREATE INDEX IF NOT EXISTS idx_audience_snapshots_document
  ON public.audience_state_snapshots(document_id);

CREATE INDEX IF NOT EXISTS idx_audience_snapshots_chunk
  ON public.audience_state_snapshots(chunk_id);

CREATE INDEX IF NOT EXISTS idx_audience_snapshots_version
  ON public.audience_state_snapshots(version_id);

-- GIN index on audience_effects for JSONB queries (dimension_key lookups, confidence filtering)
CREATE INDEX IF NOT EXISTS idx_audience_snapshots_effects
  ON public.audience_state_snapshots USING GIN (audience_effects jsonb_path_ops);

-- RLS
ALTER TABLE public.audience_state_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audience snapshots for accessible projects"
  ON public.audience_state_snapshots FOR SELECT
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can insert audience snapshots for accessible projects"
  ON public.audience_state_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update audience snapshots for accessible projects"
  ON public.audience_state_snapshots FOR UPDATE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

-- Updated_at trigger
CREATE TRIGGER set_audience_state_snapshots_updated_at
  BEFORE UPDATE ON public.audience_state_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;