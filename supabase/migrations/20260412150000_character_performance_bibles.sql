-- Character Performance Bibles — Phase 4.3
CREATE TABLE character_performance_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES narrative_entities(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT false,
  content JSONB NOT NULL,
  depends_on_resolver_hash TEXT,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, character_id, version_number)
);

CREATE UNIQUE INDEX idx_bibles_current
  ON character_performance_bibles(project_id, character_id)
  WHERE is_current = true;

ALTER TABLE character_performance_bibles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read character_performance_bibles"
  ON character_performance_bibles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage character_performance_bibles"
  ON character_performance_bibles FOR ALL
  USING (auth.role() = 'service_role');
