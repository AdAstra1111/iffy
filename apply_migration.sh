#!/bin/bash
# Apply migration via exec_sql
SRK=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/laralane/code/iffy/.env.local | head -1 | sed 's/.*="//' | sed 's/"$//')

curl -s "https://hdfderbphdobomkdjypc.supabase.co/rest/v1/rpc/exec_sql" \
  -X POST \
  -H "apikey: ${SRK}" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d @/dev/stdin <<'ENDSQL'
{"query": "CREATE TABLE IF NOT EXISTS scene_intelligence_packages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, scene_id UUID NOT NULL REFERENCES scene_index(id) ON DELETE CASCADE, scene_number INT NOT NULL, scene_action TEXT, scene_objective TEXT, scene_conflict TEXT, dramatic_question TEXT, scene_consequence TEXT, scene_consequence_significance TEXT, scene_consequence_anchors TEXT[], emotional_turn TEXT, dominant_character TEXT, vulnerable_character TEXT, observer_characters TEXT[], power_dynamic TEXT, tension_level INT, character_intentions JSONB, subtext_summary TEXT, residue_created TEXT, blocking_map JSONB, gaze_map JSONB, body_position_map JSONB, attention_map JSONB, camera_intent TEXT, visual_moment_type TEXT, performance_direction TEXT, character_state_delta JSONB, relationship_state_delta JSONB, knowledge_delta JSONB, world_state_delta JSONB, evidence_excerpt TEXT, evidence_hash TEXT, extraction_method TEXT, source_version_id UUID, source_tables TEXT[], confidence TEXT, is_current BOOLEAN DEFAULT true, stale_reason TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), created_by UUID, UNIQUE(project_id, scene_id)); CREATE INDEX IF NOT EXISTS idx_sip_project ON scene_intelligence_packages(project_id); CREATE INDEX IF NOT EXISTS idx_sip_scene ON scene_intelligence_packages(scene_id); CREATE INDEX IF NOT EXISTS idx_sip_current ON scene_intelligence_packages(project_id, is_current); ALTER TABLE project_images ADD COLUMN IF NOT EXISTS scene_intelligence_package_id UUID REFERENCES scene_intelligence_packages(id); ALTER TABLE project_images ADD COLUMN IF NOT EXISTS scene_intelligence_hash TEXT; ALTER TABLE project_images ADD COLUMN IF NOT EXISTS evidence_excerpt_hash TEXT;"}
ENDSQL