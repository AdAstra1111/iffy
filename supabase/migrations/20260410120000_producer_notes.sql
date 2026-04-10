-- Migration: producer_notes + reconciliation_flags
-- Phase 1 of Approval + Producer Notes + Cascade Flow
-- Status: 2026-04-10

-- ─── producer_notes ────────────────────────────────────────────────────────────
-- Locked decisions per divergence. Immutable once locked.
CREATE TABLE IF NOT EXISTS producer_notes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_doc_type          TEXT NOT NULL,  -- concept_brief | beat_sheet | character_bible | treatment
  source_doc_version_id    UUID NOT NULL,
  divergence_id            TEXT NOT NULL,  -- client-generated ID for phase 1
  decision                TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  note_text               TEXT,
  entity_tag              TEXT,
  created_by              TEXT DEFAULT 'producer',
  created_at              TIMESTAMPTZ DEFAULT now(),
  locked                  BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_producer_notes_project_id      ON producer_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_producer_notes_source_doc      ON producer_notes(source_doc_type, source_doc_version_id);
CREATE INDEX IF NOT EXISTS idx_producer_notes_entity_tag      ON producer_notes(entity_tag) WHERE entity_tag IS NOT NULL;

ALTER TABLE producer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage producer_notes for accessible projects"
  ON producer_notes FOR ALL
  USING (public.has_project_access(auth.uid(), project_id))
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

-- ─── reconciliation_flags ──────────────────────────────────────────────────────
-- Flags downstream doc versions that need reconciliation after an upstream approval
CREATE TABLE IF NOT EXISTS reconciliation_flags (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  downstream_doc_type          TEXT NOT NULL,
  downstream_doc_version_id     UUID NOT NULL,
  triggered_by_producer_note_id UUID REFERENCES producer_notes(id) ON DELETE SET NULL,
  entity_tag                   TEXT,
  reason                       TEXT,
  created_at                   TIMESTAMPTZ DEFAULT now(),
  cleared_at                   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_flags_project    ON reconciliation_flags(project_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_flags_downstream ON reconciliation_flags(downstream_doc_type, downstream_doc_version_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_flags_active    ON reconciliation_flags(project_id) WHERE cleared_at IS NULL;

ALTER TABLE reconciliation_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage reconciliation_flags for accessible projects"
  ON reconciliation_flags FOR ALL
  USING (public.has_project_access(auth.uid(), project_id))
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

-- ─── project_document_versions additions ───────────────────────────────────────
ALTER TABLE project_document_versions
  ADD COLUMN IF NOT EXISTS producer_note_id         UUID REFERENCES producer_notes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_source     JSONB;  -- { upstream_note_id, upstream_doc_type, upstream_version_id }
