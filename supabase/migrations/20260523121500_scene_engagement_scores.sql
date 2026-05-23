-- ═══════════════════════════════════════════════════════════════
-- IFFY — Neural Validation + Scene Engagement Scores
--
-- 1. Create neural_validation_runs table (if not exists)
-- 2. Add prediction_source column
-- 3. Create scene_engagement_scores table
-- 4. Extend document_version_subscores category constraint
-- ═══════════════════════════════════════════════════════════════

-- ── 1. neural_validation_runs (from neural-validation/migration.sql) ──
-- Note: Uses project_document_versions (not project_versions) for FK correctness

CREATE TABLE IF NOT EXISTS public.neural_validation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.project_documents(id) ON DELETE SET NULL,
    document_version_id UUID REFERENCES public.project_document_versions(id) ON DELETE SET NULL,

    -- Layer type: what kind of validation was performed
    layer_type TEXT NOT NULL CHECK (layer_type IN ('beat', 'scene', 'character', 'sequence', 'performance-proxy')),

    -- Input
    input_text_hash TEXT NOT NULL,
    input_text_preview TEXT,
    model_version TEXT NOT NULL,

    -- Intent Target (Layer 0) — what the creator intended
    target_json JSONB NOT NULL DEFAULT '{}',

    -- TRIBE v2 output — predicted brain response
    output_json JSONB NOT NULL DEFAULT '{}',

    -- Divergence analysis — flags + suggestions
    divergence_json JSONB NOT NULL DEFAULT '{}',

    -- Prediction source (added by TRIBE neural feedback integration)
    prediction_source TEXT CHECK (prediction_source IN ('tribe_realtime', 'tribe_simulated', 'surrogate')),

    -- Run status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),

    -- Provenance
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_neural_runs_project_id ON public.neural_validation_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_neural_runs_document_id ON public.neural_validation_runs(document_id);
CREATE INDEX IF NOT EXISTS idx_neural_runs_created_at   ON public.neural_validation_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_neural_runs_layer_type   ON public.neural_validation_runs(layer_type);
CREATE INDEX IF NOT EXISTS idx_neural_runs_text_hash    ON public.neural_validation_runs(input_text_hash);

-- RLS
ALTER TABLE public.neural_validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY neural_runs_select ON public.neural_validation_runs
    FOR SELECT
    USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY neural_runs_insert ON public.neural_validation_runs
    FOR INSERT
    WITH CHECK (true);

-- ── 2. New Table: scene_engagement_scores ─────────────────────

CREATE TABLE IF NOT EXISTS public.scene_engagement_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign references
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.project_documents(id) ON DELETE CASCADE,
    document_version_id UUID REFERENCES public.project_document_versions(id) ON DELETE CASCADE,
    neural_validation_run_id UUID REFERENCES public.neural_validation_runs(id) ON DELETE SET NULL,

    -- Scene identification
    scene_key TEXT NOT NULL,
    scene_heading TEXT,

    -- Engagement composite (0-100)
    total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 100),

    -- Sub-dimensions (all 0-100)
    emotional_journey_score INTEGER CHECK (emotional_journey_score >= 0 AND emotional_journey_score <= 100),
    character_connection_score INTEGER CHECK (character_connection_score >= 0 AND character_connection_score <= 100),
    narrative_absorption_score INTEGER CHECK (narrative_absorption_score >= 0 AND narrative_absorption_score <= 100),
    visceral_impact_score INTEGER CHECK (visceral_impact_score >= 0 AND visceral_impact_score <= 100),
    cognitive_load_score INTEGER CHECK (cognitive_load_score >= 0 AND cognitive_load_score <= 100),

    -- Raw ROI values (for debugging/threshold customization)
    raw_roi_json JSONB NOT NULL DEFAULT '{}',

    -- Metadata
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    prediction_source TEXT NOT NULL CHECK (prediction_source IN ('tribe_realtime', 'tribe_simulated', 'surrogate')),

    -- Version tracking
    score_version INTEGER NOT NULL DEFAULT 1,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique: one engagement score per (document_version_id, scene_key)
    UNIQUE(document_version_id, scene_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_engagement_project  ON public.scene_engagement_scores(project_id);
CREATE INDEX IF NOT EXISTS idx_engagement_document ON public.scene_engagement_scores(document_id);
CREATE INDEX IF NOT EXISTS idx_engagement_version  ON public.scene_engagement_scores(document_version_id);
CREATE INDEX IF NOT EXISTS idx_engagement_score    ON public.scene_engagement_scores(total_score DESC);

-- RLS
ALTER TABLE public.scene_engagement_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY engagement_select ON public.scene_engagement_scores
    FOR SELECT
    USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY engagement_insert ON public.scene_engagement_scores
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY engagement_update ON public.scene_engagement_scores
    FOR UPDATE
    USING (true);

-- ── 3. Extend document_version_subscores category constraint ──

ALTER TABLE IF EXISTS public.document_version_subscores
    DROP CONSTRAINT IF EXISTS document_version_subscores_category_check;

ALTER TABLE IF EXISTS public.document_version_subscores
    ADD CONSTRAINT document_version_subscores_category_check
    CHECK (category IN ('CI', 'GP', 'ENGAGEMENT'));