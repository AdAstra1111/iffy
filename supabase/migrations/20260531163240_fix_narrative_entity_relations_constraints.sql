-- Fix narrative_entity_relations constraints
-- entity-links-engine inserts with relation_type='co_occurs' and source_kind='entity-links-engine:v2'
-- Both were missing from their respective check constraints

ALTER TABLE public.narrative_entity_relations
DROP CONSTRAINT IF EXISTS narrative_entity_relations_relation_type_check;

ALTER TABLE public.narrative_entity_relations
ADD CONSTRAINT narrative_entity_relations_relation_type_check
CHECK (relation_type = ANY (ARRAY[
  'co_occurs', 'alias', 'character_present', 'referenced',
  'appears_in', 'located_at', 'owns', 'involved_in'
]));

ALTER TABLE public.narrative_entity_relations
DROP CONSTRAINT IF EXISTS narrative_entity_relations_source_kind_check;

ALTER TABLE public.narrative_entity_relations
ADD CONSTRAINT narrative_entity_relations_source_kind_check
CHECK (source_kind = ANY (ARRAY[
  'canon_sync', 'spine_derivation', 'manual', 'dev_seed_v2', 'entity-links-engine:v2'
]));
