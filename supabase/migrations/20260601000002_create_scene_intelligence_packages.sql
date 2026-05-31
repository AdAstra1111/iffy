-- Scene Intelligence Package v1.2
-- Creates scene_intelligence_packages table and related schema
-- Part of the Narrative Intelligence Engine

-- 1. Create scene_intelligence_packages table
CREATE TABLE IF NOT EXISTS scene_intelligence_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id        UUID NOT NULL REFERENCES scene_index(id) ON DELETE CASCADE,
  scene_number    INT NOT NULL,

  -- Layer A: Narrative Intelligence
  scene_action              TEXT,
  scene_objective           TEXT,
  scene_conflict            TEXT,
  dramatic_question         TEXT,
  scene_consequence         TEXT,
  scene_consequence_significance TEXT CHECK (scene_consequence_significance IN ('minor', 'moderate', 'major', 'critical')),
  scene_consequence_anchors       TEXT[],
  emotional_turn            TEXT,
  dominant_character        TEXT,
  vulnerable_character      TEXT,
  observer_characters       TEXT[],
  power_dynamic             TEXT,
  tension_level             INT CHECK (tension_level BETWEEN 1 AND 10),
  character_intentions      JSONB,
  subtext_summary           TEXT,
  residue_created           TEXT,

  -- Layer B: Visual / Performance Projection
  blocking_map              JSONB,
  gaze_map                  JSONB,
  body_position_map         JSONB,
  attention_map             JSONB,
  camera_intent             TEXT,
  visual_moment_type        TEXT CHECK (visual_moment_type IN (
    'confrontation', 'discovery', 'intimacy', 'action', 'atmosphere',
    'pursuit', 'threat', 'revelation', 'ensemble', 'transition'
  )),
  performance_direction     TEXT,

  -- Layer C: Narrative State Tracking
  -- scene_consequence (above) is the authoritative consequence field
  -- v2 structured deltas: null in v1, schema reserved
  character_state_delta     JSONB,
  relationship_state_delta  JSONB,
  knowledge_delta           JSONB,
  world_state_delta         JSONB,

  -- Extraction Provenance
  evidence_excerpt          TEXT,
  evidence_hash             TEXT,
  extraction_method         TEXT CHECK (extraction_method IN ('deterministic_regex', 'structured_inference', 'ai_interp')),
  source_version_id         UUID,
  source_tables             TEXT[],
  confidence                TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  is_current                BOOLEAN DEFAULT true,
  stale_reason              TEXT,

  -- Metadata
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  created_by                UUID,

  -- Ensure one current package per scene
  UNIQUE(project_id, scene_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sip_project ON scene_intelligence_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_sip_scene ON scene_intelligence_packages(scene_id);
CREATE INDEX IF NOT EXISTS idx_sip_current ON scene_intelligence_packages(project_id, is_current);
CREATE INDEX IF NOT EXISTS idx_sip_anchors ON scene_intelligence_packages USING GIN(scene_consequence_anchors);

-- 2. Add provenance columns to project_images
ALTER TABLE project_images 
  ADD COLUMN IF NOT EXISTS scene_intelligence_package_id UUID REFERENCES scene_intelligence_packages(id),
  ADD COLUMN IF NOT EXISTS scene_intelligence_hash TEXT,
  ADD COLUMN IF NOT EXISTS evidence_excerpt_hash TEXT;

-- 3. RLS: project-scoped access
ALTER TABLE scene_intelligence_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY sip_project_access ON scene_intelligence_packages
  FOR ALL
  USING (project_id IN (
    SELECT project_id FROM project_members WHERE user_id = auth.uid()
  ));

-- 4. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE scene_intelligence_packages;
