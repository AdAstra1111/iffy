-- Migration: narrative_entity_aliases — Phase 1.2 Gap D
-- Maps raw character name fragments/variants to their canonical narrative_entities.id
-- Layer 3 of the 3-layer dedup strategy.
--
-- Pre-populated with known YETI aliases:
--   BI, BLACKSTONE, LACKSTONE, BILL BLACKSTOSNE → BILL BLACKSTONE
-- After entity-links-engine runs, auto-populated via co-occurrence analysis.

CREATE TABLE IF NOT EXISTS public.narrative_entity_aliases (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL,
  canonical_entity_id uuid     NOT NULL,  -- → narrative_entities(id)
  alias_name        text        NOT NULL,  -- the raw fragment/abbreviation/variant
  source            text        NOT NULL DEFAULT 'manual',  -- 'manual' | 'co_occurrence' | 'levenshtein'
  confidence        numeric     NOT NULL DEFAULT 1.0,        -- 0.0-1.0
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT narrative_entity_aliases_pkey PRIMARY KEY (id)
);

-- Unique alias per project (no duplicate alias names)
ALTER TABLE public.narrative_entity_aliases
  ADD CONSTRAINT narrative_entity_aliases_project_alias_key
  UNIQUE (project_id, alias_name);

-- FK to narrative_entities
ALTER TABLE public.narrative_entity_aliases
  ADD CONSTRAINT narrative_entity_aliases_canonical_entity_id_fkey
  FOREIGN KEY (canonical_entity_id) REFERENCES public.narrative_entities(id) ON DELETE CASCADE;

ALTER TABLE public.narrative_entity_aliases ENABLE ROW LEVEL SECURITY;

-- Service role and authenticated users can read
CREATE POLICY "nea_select" ON public.narrative_entity_aliases
  FOR SELECT TO authenticated
  USING (has_project_access(auth.uid(), project_id));

-- Only service role can insert/update (auto-populated, not user-facing)
CREATE POLICY "nea_admin" ON public.narrative_entity_aliases
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "nea_admin_update" ON public.narrative_entity_aliases
  FOR UPDATE TO service_role USING (true);

-- Index for fast alias lookup by project + alias_name
CREATE INDEX IF NOT EXISTS idx_nea_lookup
  ON public.narrative_entity_aliases (project_id, alias_name);

-- Index for fast lookup by canonical entity
CREATE INDEX IF NOT EXISTS idx_nea_canonical
  ON public.narrative_entity_aliases (project_id, canonical_entity_id);

-- Pre-seed known YETI aliases (BILL BLACKSTONE collision cluster)
-- These fragments were extracted from ALL-CAPS content but are all the same character
INSERT INTO public.narrative_entity_aliases (project_id, canonical_entity_id, alias_name, source, confidence, reason)
SELECT
  '56e96756-c622-413f-9a48-c55cf86277d7',
  ne.id,
  v.alias_name,
  'manual',
  1.0,
  'Known character fragment — all refer to BILL BLACKSTONE'
FROM narrative_entities ne
CROSS JOIN (VALUES
  ('BI'),
  ('BLACKSTONE'),
  ('LACKSTONE'),
  ('LL BLACKSTONE'),
  ('BILL BLACKSTOSNE'),
  ('BILL BLACKSTONE'),
  ('BILL BLACKSTONS'),
  ('BILL BLACKSTONE.'),
  ('BILL')
) AS v(alias_name)
WHERE ne.project_id = '56e96756-c622-413f-9a48-c55cf86277d7'
  AND ne.canonical_name ILIKE '%BILL%BLACKSTONE%'
ON CONFLICT (project_id, alias_name) DO NOTHING;
