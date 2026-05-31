-- Fix narrative_entities_source_kind_check to include 'screenplay'
-- 6851 existing rows use source_kind='screenplay' (legitimate value)
-- entity-links-engine inserts with source_kind='screenplay'
-- Current constraint (NOT VALID) allowed: project_canon, spine_axis, manual, dev_seed_v2
-- Added: screenplay

ALTER TABLE public.narrative_entities
DROP CONSTRAINT IF EXISTS narrative_entities_source_kind_check;

ALTER TABLE public.narrative_entities
ADD CONSTRAINT narrative_entities_source_kind_check
CHECK (source_kind = ANY (ARRAY[
  'project_canon', 'spine_axis', 'manual', 'dev_seed_v2', 'screenplay'
]));
