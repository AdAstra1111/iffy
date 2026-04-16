-- Migration: add inputs_used JSONB column for content hash tracking (Gap C)
-- Stores: { parent_plaintext: sha256_hash, source_id, source_doc_type }
-- Enables staleness detection: if scene content changes, hash mismatches → stale

ALTER TABLE public.narrative_scene_entity_links
  ADD COLUMN IF NOT EXISTS inputs_used jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.narrative_entities
  ADD COLUMN IF NOT EXISTS inputs_used jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index for fast stale lookups by project + source
CREATE INDEX IF NOT EXISTS idx_nsel_inputs_used
  ON public.narrative_scene_entity_links (project_id)
  WHERE inputs_used != '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ne_inputs_used
  ON public.narrative_entities (project_id)
  WHERE inputs_used != '{}'::jsonb;
