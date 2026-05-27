-- P0: Expand entity_type CHECK constraints to support non-character entities
-- 
-- Part of the Full Visual Pipeline wiring + entity taxonomy + governance rewire.
-- Expands both narrative_entities and entity_visual_states CHECK constraints
-- to accept creature, vehicle, prop, and other entity types required by
-- the story-ingestion-engine and visual pipeline.

-- 1. Expand narrative_entities.entity_type CHECK
--    Current: 'character', 'arc', 'conflict'
--    Expanded: +'creature', 'vehicle', 'prop', 'environment', 'item', 'event', 'concept'
--    CRITICAL: Unblocks story-ingestion-engine which inserts entity_type='location',
--              'prop', 'costume_look' (lines 428-431)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='narrative_entities_entity_type_check'
      AND conrelid='public.narrative_entities'::regclass
  ) THEN
    ALTER TABLE public.narrative_entities
      DROP CONSTRAINT narrative_entities_entity_type_check;
  END IF;
END $$;

ALTER TABLE public.narrative_entities ADD CONSTRAINT narrative_entities_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'character'::text,
    'arc'::text,
    'conflict'::text,
    'creature'::text,
    'vehicle'::text,
    'prop'::text,
    'environment'::text,
    'item'::text,
    'event'::text,
    'concept'::text,
    'location'::text,
    'costume_look'::text
  ]));

-- 2. Expand entity_visual_states.entity_type CHECK
--    Current: 'character', 'location', 'object'
--    Expanded: +'creature', 'vehicle', 'prop'
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entity_visual_states'
      AND column_name='entity_type'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='entity_visual_states_entity_type_check'
        AND conrelid='public.entity_visual_states'::regclass
    ) THEN
      ALTER TABLE public.entity_visual_states
        DROP CONSTRAINT entity_visual_states_entity_type_check;
    END IF;

    ALTER TABLE public.entity_visual_states ADD CONSTRAINT entity_visual_states_entity_type_check
      CHECK (entity_type = ANY (ARRAY[
        'character'::text,
        'location'::text,
        'object'::text,
        'creature'::text,
        'vehicle'::text,
        'prop'::text
      ]));
  END IF;
END $$;