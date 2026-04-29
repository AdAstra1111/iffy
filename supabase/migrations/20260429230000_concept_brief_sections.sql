-- Migration: 20260429230000_concept_brief_sections.sql
-- Creates concept_brief_sections table for section-level tracking of concept brief documents

CREATE TABLE IF NOT EXISTS concept_brief_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES project_document_versions(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  section_label TEXT NOT NULL,
  plaintext TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  convergence_score_json JSONB,
  canon_drift_json JSONB,
  rewrite_attempts INTEGER DEFAULT 0,
  last_rewrite_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(version_id, section_key)
);

-- Indexes for common query patterns
CREATE INDEX idx_cbs_project ON concept_brief_sections(project_id);
CREATE INDEX idx_cbs_version ON concept_brief_sections(version_id);
CREATE INDEX idx_cbs_status ON concept_brief_sections(status);
CREATE INDEX idx_cbs_section_key ON concept_brief_sections(section_key);

-- Trigger to auto-set updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER concept_brief_sections_updated_at
  BEFORE UPDATE ON concept_brief_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
