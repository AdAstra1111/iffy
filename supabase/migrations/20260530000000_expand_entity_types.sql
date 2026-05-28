-- PHASE 3 — Expand narrative_entities.entity_type to support non-human entity types
-- Adds: creature, animal, vehicle, prop, location
-- This is additive — existing 'character' entities are unaffected.

DO $$ BEGIN
  -- Drop the existing constraint
  ALTER TABLE public.narrative_entities DROP CONSTRAINT IF EXISTS narrative_entities_entity_type_check;
  
  -- Recreate with expanded type list
  ALTER TABLE public.narrative_entities ADD CONSTRAINT narrative_entities_entity_type_check
    CHECK (entity_type = ANY (ARRAY[
      'character'::text,
      'creature'::text,
      'animal'::text,
      'vehicle'::text,
      'prop'::text,
      'location'::text,
      'arc'::text,
      'conflict'::text
    ]));
END $$;