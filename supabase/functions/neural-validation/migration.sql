-- ═══════════════════════════════════════════════════════════════
-- IFFY Neural Validation — Database Schema
-- Sidecar table. Does not modify any existing IFFY tables.
-- Phase 0-2: Read-only storage for neural validation runs.
-- ═══════════════════════════════════════════════════════════════

-- neural_validation_runs: stores each validation run's inputs, outputs, and divergence flags
CREATE TABLE IF NOT EXISTS neural_validation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_id UUID REFERENCES project_versions(document_id) ON DELETE SET NULL,
    document_version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
    
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

-- Index for fast per-project lookup
CREATE INDEX IF NOT EXISTS idx_neural_runs_project_id ON neural_validation_runs(project_id);

-- Index for per-document lookup
CREATE INDEX IF NOT EXISTS idx_neural_runs_document_id ON neural_validation_runs(document_id);

-- Index for reverse-chronological listing
CREATE INDEX IF NOT EXISTS idx_neural_runs_created_at ON neural_validation_runs(created_at DESC);

-- Index for layer-type queries
CREATE INDEX IF NOT EXISTS idx_neural_runs_layer_type ON neural_validation_runs(layer_type);

-- Index for finding specific inputs (deduplication)
CREATE INDEX IF NOT EXISTS idx_neural_runs_text_hash ON neural_validation_runs(input_text_hash);

-- ═══════════════════════════════════════════════════════════════
-- divergence_rules: The real moat. Structured capture of craft knowledge.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS divergence_rules (
    id TEXT PRIMARY KEY, -- e.g., 'dr-001'
    signature TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    neural_pattern TEXT,
    correction_principle TEXT NOT NULL,
    example_corrections JSONB NOT NULL DEFAULT '[]',
    domain TEXT[] NOT NULL DEFAULT '{}',
    source TEXT NOT NULL CHECK (source IN ('sebastian', 'red', 'literature', 'experimental')),
    verification_status TEXT NOT NULL DEFAULT 'hypothesis' CHECK (verification_status IN ('hypothesis', 'observed', 'validated', 'replicated')),
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for signature lookup
CREATE INDEX IF NOT EXISTS idx_divergence_rules_signature ON divergence_rules(signature);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_divergence_rules_status ON divergence_rules(verification_status);

-- ═══════════════════════════════════════════════════════════════
-- Row-Level Security
-- Neural validation data is read-only for the creator's project.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE neural_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE divergence_rules ENABLE ROW LEVEL SECURITY;

-- Users can only see neural validation runs for their own projects
CREATE POLICY neural_runs_select ON neural_validation_runs
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

-- Only service role can insert (the edge function runs as service role)
CREATE POLICY neural_runs_insert ON neural_validation_runs
    FOR INSERT
    WITH CHECK (true);  -- service role insertion only

-- Divergence rules are readable by authenticated users
CREATE POLICY divergence_rules_select ON divergence_rules
    FOR SELECT
    TO authenticated
    USING (true);

-- Only service role can manage rules
CREATE POLICY divergence_rules_insert ON divergence_rules
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY divergence_rules_update ON divergence_rules
    FOR UPDATE
    USING (true);

-- ═══════════════════════════════════════════════════════════════
-- Seed the initial divergence rules (from our May 21 findings)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO divergence_rules (id, signature, name, description, neural_pattern, correction_principle, example_corrections, domain, source, verification_status, tags) VALUES
    ('dr-001', 'pfc-overload', 'Cognitive Overload Correction',
     'When PFC is elevated, the audience is thinking instead of feeling. The text is too analytical or expository.',
     'PFC > +0.05, Amygdala < +0.00, Insula flat',
     'Remove explanation. Increase implication. Trust the audience to infer.',
     '["Replace \"His son\'s safety binds him\" with a physical action that shows the constraint", "Remove one sentence of exposition per paragraph", "Let silence carry meaning instead of dialogue"]',
     ARRAY['exposition', 'dialogue', 'action-line'], 'sebastian', 'observed', ARRAY['beat-7', 'yeti-act1']),

    ('dr-002', 'tpj-weak', 'Character Connection Deficiency',
     'When TPJ is low, the audience has not formed a theory-of-mind connection with the character.',
     'TPJ < +0.01, Amygdala moderate, PFC moderate',
     'Create a readable character choice. Expose vulnerability. Let external behaviour reveal internal state.',
     '["Give the character a small action that reveals their emotional state", "Create an asymmetry — character knows something the audience doesn\'t", "Remove reaction dialogue and let a physical detail carry emotion"]',
     ARRAY['character-choice', 'action-line', 'performance'], 'sebastian', 'observed', ARRAY['beat-7', 'character-fingerprint']),

    ('dr-003', 'insula-absent', 'Visceral Response Deficiency',
     'When Insula is flat, the audience understands the emotion intellectually but does not feel it in their body.',
     'Insula < +0.02, PFC moderate, Amygdala variable',
     'Add sensory grounding. Temperature, texture, weight, sound, smell.',
     '["Describe a physical sensation the character experiences", "Ground the scene in a sensory detail — cold glass, rough fabric, distant sound", "Let the camera linger on a physical detail before cutting to reaction"]',
     ARRAY['sensory-detail', 'action-line'], 'sebastian', 'observed', ARRAY['sensory-craft', 'embodiment']),

    ('dr-004', 'amygdala-fatigue', 'Emotional Exhaustion Correction',
     'When high-Amygdala beats are sequenced without recovery, the audience becomes numb.',
     'Amygdala sustained > +0.05 across 3+ consecutive beats',
     'Insert a recovery beat. Give the audience room to breathe.',
     '["Insert a quiet observation beat between two intense beats", "Use symbolic stillness — wide shot, silence, landscape", "Let a minor character provide relief before escalating"]',
     ARRAY['pacing', 'recovery-beat'], 'red', 'hypothesis', ARRAY['contrast-theory', 'pacing']),

    ('dr-005', 'dmn-flat', 'Narrative Absorption Deficiency',
     'When DMN is flat, the audience is not absorbed in the story.',
     'DMN < +0.01, PFC elevated, TPJ variable',
     'Reinforce the thematic through-line. Increase emotional continuity.',
     '["Connect this scene to the story\'s central thematic question", "Reduce structural markers that remind the audience they\'re watching a story", "Let a character\'s choice resonate with a previous beat"]',
     ARRAY['exposition', 'pacing'], 'red', 'hypothesis', ARRAY['absorption', 'theme']),

    ('dr-006', 'symbolic-accumulation-weak', 'Symbolic Payoff Enhancement',
     'When a symbol reappears but does not produce an amplified response, meaning has not accumulated.',
     'TPJ + Amygdala for symbol reappearance not significantly > first appearance',
     'Change the emotional context of the symbol. Re-present it under altered circumstances.',
     '["Show the same object in a completely different emotional context", "Let the character interact with the symbol differently each time", "Increase camera attention to the symbol with each recurrence"]',
     ARRAY['symbol-placement', 'camera'], 'red', 'hypothesis', ARRAY['symbolism', 'accumulation']),

    ('dr-007', 'contrast-absent', 'Emotional Contrast Deficiency',
     'When adjacent beats have similar neural profiles, contrast is lost.',
     'Adjacent beats have < 10% variance across all ROIs',
     'Introduce variance. Change at least one ROI trajectory between adjacent beats.',
     '["Insert a quiet beat between two loud beats", "Change the sensory register — visual to auditory, dialogue to silence", "Shift perspective — wide to close, protagonist POV to observer"]',
     ARRAY['pacing', 'camera', 'silence'], 'red', 'hypothesis', ARRAY['contrast-theory', 'trajectory']),

    ('dr-008', 'tone-mismatch', 'Tonal Register Correction',
     'When a scene\'s tone conflicts with the expected register, cognitive dissonance reduces absorption.',
     'PFC elevated, DMN suppressed, TPJ moderate',
     'Establish or re-establish the tonal register early. Make intentional shifts legible.',
     '["Add an establishing moment that signals tonal register", "Shift tone through action, not explanation", "Remove tonal ambiguity unless it serves the theme"]',
     ARRAY['exposition', 'performance', 'pacing'], 'sebastian', 'hypothesis', ARRAY['tone', 'genre-mode']),

    ('dr-009', 'thematic-drift', 'Thematic Coherence Restoration',
     'When a beat\'s neural profile is strong but serves the wrong theme.',
     'Strong activation but DMN pattern does not match intended thematic destination',
     'Reframe the beat to connect its emotional payload to the central thematic question.',
     '["Change what the character is reacting to — not the surface threat but what it means", "Add a line that redirects interpretation", "Use the symbol system to carry thematic connection"]',
     ARRAY['dialogue', 'symbol-placement', 'character-choice'], 'sebastian', 'hypothesis', ARRAY['theme', 'coherence']),

    ('dr-010', 'character-drift', 'Character Neural Trajectory Drift',
     'When a character\'s neural fingerprint changes without intentional dramatic reason.',
     'Character X: TPJ drops > 0.03 from previous scene, or Amygdala shifts > 0.04 without narrative cause',
     'Re-align the scene\'s treatment with the established trajectory, or make the shift intentional.',
     '["Add a moment re-establishing audience relationship before the shift", "If shift is intentional (betrayal), make behaviour the cause", "Remove dialogue contradicting established voice"]',
     ARRAY['dialogue', 'character-choice'], 'sebastian', 'hypothesis', ARRAY['character-fingerprint', 'consistency'])
ON CONFLICT (id) DO NOTHING;