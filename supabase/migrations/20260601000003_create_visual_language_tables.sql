-- Visual Language Atomiser v1 — Graph-First Architecture
-- Creates 3 tables: visual_language_atoms (identity), visual_language_projections (projection), visual_language_relations (graph edges)
-- CDG: node D7, upstream C5
-- Part of SESS-IMP-0047B

-- 1. visual_language_atoms — IDENTITY LAYER
CREATE TABLE IF NOT EXISTS visual_language_atoms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Identity (survives rewrites, renumbering, camera changes)
  stable_key        TEXT NOT NULL,
  canonical_name    TEXT NOT NULL,
  description       TEXT,
  visual_intent     TEXT,
  cinematic_function TEXT,

  -- Narrative pressure signatures
  pressure_signatures TEXT[] DEFAULT '{}',

  -- Metadata
  confidence        NUMERIC DEFAULT 0,
  generation_status TEXT DEFAULT 'pending' CHECK (generation_status IN ('pending', 'running', 'complete', 'failed')),
  readiness_state   TEXT DEFAULT 'stub',
  attributes        JSONB DEFAULT '{}',

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_vl_atom_per_project_stable_key UNIQUE (project_id, stable_key),
  CONSTRAINT unique_vl_atom_per_project_name UNIQUE (project_id, canonical_name)
);

-- 2. visual_language_projections — PROJECTION LAYER (1:1 with atoms)
CREATE TABLE IF NOT EXISTS visual_language_projections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vl_atom_id        UUID NOT NULL REFERENCES visual_language_atoms(id) ON DELETE CASCADE,

  -- Link to project_visual_style if projection was derived from it
  project_visual_style_id UUID NULL,

  -- CPIE vl-domain projection attributes (mirrored from registry)
  colour_philosophy    TEXT,
  contrast_model       TEXT,
  lighting_philosophy  TEXT,
  shadow_philosophy    TEXT,
  lens_philosophy      TEXT,
  saturation_profile   TEXT,
  palette_bias         TEXT,
  texture_philosophy   TEXT,
  atmosphere_philosophy TEXT,
  focus_philosophy     TEXT,
  depth_philosophy     TEXT,
  realism_level        TEXT,
  visual_scale         TEXT,

  -- Provenance
  provenance        TEXT,
  confidence        NUMERIC DEFAULT 0,

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_vl_projection_per_atom UNIQUE (project_id, vl_atom_id)
);

-- 3. visual_language_relations — GRAPH EDGE LAYER
CREATE TABLE IF NOT EXISTS visual_language_relations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_atom_id      UUID NOT NULL REFERENCES visual_language_atoms(id) ON DELETE CASCADE,
  to_atom_id        UUID NOT NULL REFERENCES visual_language_atoms(id) ON DELETE CASCADE,

  relation_type     TEXT NOT NULL CHECK (relation_type IN (
    'enables', 'depends_on', 'evolves_into', 'contrasts_with',
    'mirrors', 'visualises', 'intensifies', 'resolves'
  )),

  confidence        NUMERIC DEFAULT 0,
  provenance        TEXT,

  created_at        TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_vl_relation UNIQUE (from_atom_id, to_atom_id, relation_type),
  CONSTRAINT no_self_loop CHECK (from_atom_id <> to_atom_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_vl_atoms_project ON visual_language_atoms(project_id);
CREATE INDEX IF NOT EXISTS idx_vl_atoms_status ON visual_language_atoms(project_id, generation_status);
CREATE INDEX IF NOT EXISTS idx_vl_projections_atom ON visual_language_projections(vl_atom_id);
CREATE INDEX IF NOT EXISTS idx_vl_relations_from ON visual_language_relations(from_atom_id);
CREATE INDEX IF NOT EXISTS idx_vl_relations_to ON visual_language_relations(to_atom_id);
CREATE INDEX IF NOT EXISTS idx_vl_relations_project ON visual_language_relations(project_id);

-- 5. Enable RLS (service-role only access from edge functions)
ALTER TABLE visual_language_atoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_language_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_language_relations ENABLE ROW LEVEL SECURITY;

-- 6. RLS: service_role bypass (consistent with other atom tables)
CREATE POLICY "service_role_all_vl_atoms"
  ON visual_language_atoms
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_vl_projections"
  ON visual_language_projections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_vl_relations"
  ON visual_language_relations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE visual_language_atoms;
ALTER PUBLICATION supabase_realtime ADD TABLE visual_language_projections;
ALTER PUBLICATION supabase_realtime ADD TABLE visual_language_relations;
