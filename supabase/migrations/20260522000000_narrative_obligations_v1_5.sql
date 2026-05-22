-- ============================================================
-- Narrative Obligation Confidence Schema + Taxonomy + Field Intensity
-- Migration: 20260522000000_narrative_obligations_v1_5.sql
--
-- Additive only. Adds 11 new columns + 4 indexes to
-- public.narrative_obligations for:
--   (1) Confidence schema — detection_confidence, evidence_refs,
--       detection_mode, human_verified, projection_scope
--   (2) Taxonomy bifurcation — domain
--   (3) Field intensity state machine — lifecycle_state, charge,
--       source_scene_id, target_scene_id, thread_label
-- ============================================================

-- ── Confidence schema ─────────────────────────────────────────────────────────

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS detection_confidence REAL
    CHECK (detection_confidence IS NULL OR (detection_confidence >= 0 AND detection_confidence <= 1));

COMMENT ON COLUMN public.narrative_obligations.detection_confidence IS
  'Confidence score (0.0–1.0) that this obligation was correctly detected. NULL for NC1-seeded obligations.';

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.narrative_obligations.evidence_refs IS
  'Array of evidence references supporting this obligation detection. Each entry is a JSON object describing the evidence source.';

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS detection_mode TEXT NOT NULL DEFAULT 'explicit'
    CHECK (detection_mode IN ('explicit', 'inferred', 'pattern_matched', 'ai_suggested'));

COMMENT ON COLUMN public.narrative_obligations.detection_mode IS
  'How this obligation was detected: explicit (seed-sourced), inferred (derived), pattern_matched (pattern library), ai_suggested (LLM-proposed).';

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS human_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.narrative_obligations.human_verified IS
  'Whether a human has reviewed and verified this obligation.';

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS projection_scope JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.narrative_obligations.projection_scope IS
  'Array of document layers / scopes this obligation projects into (e.g. ["treatment", "screenplay", "character_bible"]).';

-- ── Taxonomy bifurcation ──────────────────────────────────────────────────────

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'structural'
    CHECK (domain IN ('structural', 'character', 'thematic', 'tonal', 'genre', 'pacing', 'continuity'));

COMMENT ON COLUMN public.narrative_obligations.domain IS
  'Taxonomy domain for categorising obligations: structural | character | thematic | tonal | genre | pacing | continuity.';

-- ── Field intensity state machine ─────────────────────────────────────────────

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'background_active'
    CHECK (lifecycle_state IN ('background_active', 'active', 'resolved', 'superseded', 'archived'));

COMMENT ON COLUMN public.narrative_obligations.lifecycle_state IS
  'State machine: background_active (seed-level, not yet projected) | active (in-scope for validation) | resolved (fulfilled) | superseded (replaced) | archived (no longer relevant).';

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS charge REAL NOT NULL DEFAULT 5.0
    CHECK (charge >= 0 AND charge <= 10);

COMMENT ON COLUMN public.narrative_obligations.charge IS
  'Intensity / priority weight (0–10). Structural charge representing how urgently this obligation needs attention.';

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS source_scene_id UUID
    REFERENCES public.scene_graph_scenes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.narrative_obligations.source_scene_id IS
  'Scene that generated or most strongly anchors this obligation. NULL for NC1-level systemic obligations.';

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS target_scene_id UUID
    REFERENCES public.scene_graph_scenes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.narrative_obligations.target_scene_id IS
  'Scene that this obligation primarily targets or constrains. NULL for cross-cutting obligations.';

ALTER TABLE public.narrative_obligations
  ADD COLUMN IF NOT EXISTS thread_label TEXT;

COMMENT ON COLUMN public.narrative_obligations.thread_label IS
  'Optional thread label for grouping related obligations across scenes or layers (e.g. "mystery_arc_a", "red_herring_3").';

-- ── Indexes ────────────────────────────────────────────────────────────────────
-- Performance indexes for the new columns

CREATE INDEX IF NOT EXISTS narrative_obligations_detection_mode_lifecycle_idx
  ON public.narrative_obligations(detection_mode, lifecycle_state);

COMMENT ON INDEX public.narrative_obligations_detection_mode_lifecycle_idx IS
  'Query active obligations by detection mode — common NC2 filter path.';

CREATE INDEX IF NOT EXISTS narrative_obligations_domain_idx
  ON public.narrative_obligations(domain);

COMMENT ON INDEX public.narrative_obligations_domain_idx IS
  'Filter obligations by taxonomy domain.';

CREATE INDEX IF NOT EXISTS narrative_obligations_source_scene_id_idx
  ON public.narrative_obligations(source_scene_id);

COMMENT ON INDEX public.narrative_obligations_source_scene_id_idx IS
  'Lookup obligations by source scene.';

CREATE INDEX IF NOT EXISTS narrative_obligations_lifecycle_charge_idx
  ON public.narrative_obligations(lifecycle_state, charge DESC);

COMMENT ON INDEX public.narrative_obligations_lifecycle_charge_idx IS
  'Priority-ordered obligation queries by lifecycle state.';