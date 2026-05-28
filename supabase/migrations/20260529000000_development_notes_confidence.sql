-- PHASE 2A — Add confidence + evidence reference fields to development_notes
-- Classification: A — additive schema change. No behavioral impact. Existing notes get NULL.

ALTER TABLE IF EXISTS public.development_notes
  ADD COLUMN IF NOT EXISTS confidence numeric NULL,
  ADD COLUMN IF NOT EXISTS evidence_references text[] NULL;

COMMENT ON COLUMN public.development_notes.confidence IS 'LLM-reported or computed confidence in this note (0.0-1.0). NULL = not yet scored.';
COMMENT ON COLUMN public.development_notes.evidence_references IS 'Optional references to specific passages or entities this note is based on. Improves note traceability.';