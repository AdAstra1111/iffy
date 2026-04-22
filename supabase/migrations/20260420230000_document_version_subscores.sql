-- Migration: document_version_subscores
-- Purpose: Extract and persist CI/GP sub-scores as first-class queryable data
-- Enables: delta tracking, blocking detection, SR calculation, trend analysis

CREATE TABLE IF NOT EXISTS document_version_subscores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES project_document_versions(id) ON DELETE CASCADE,
  run_id UUID REFERENCES development_runs(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('CI', 'GP')),
  dimension TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  delta_from_previous FLOAT,
  trend TEXT CHECK (trend IN ('up', 'down', 'stable')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_subscores_version ON document_version_subscores(version_id);
CREATE INDEX IF NOT EXISTS idx_subscores_category ON document_version_subscores(category);
CREATE INDEX IF NOT EXISTS idx_subscores_dimension ON document_version_subscores(dimension);
CREATE INDEX IF NOT EXISTS idx_subscores_created ON document_version_subscores(created_at DESC);

-- Unique constraint: one score per dimension per version
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscores_unique ON document_version_subscores(version_id, category, dimension);

COMMENT ON TABLE document_version_subscores IS 'Extracted CI/GP sub-scores per document version — enables delta tracking, blocking, SR, and trend analysis';
