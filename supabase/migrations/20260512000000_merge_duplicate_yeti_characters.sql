-- ============================================================
-- Migration: merge_duplicate_yeti_characters
-- Consolidates duplicate YETI character entities:
--   Brother + Boy → merge into Enki
--   Sister survives as-is (no Girl entity exists in 1983a0ee)
--   Girl → Sister merge in canon_json for other projects
-- ============================================================
--
-- This migration is fully IDEMPOTENT:
--   - Checks entity status before modifying
--   - Checks if aliases already exist via ON CONFLICT DO NOTHING
--   - Uses DO $$ blocks with IF NOT EXISTS / safe patterns
--   - Works for ALL YETI projects (22 projects) via entity_key matching
--
-- Schema examined during authoring:
--   narrative_entities:     project_id, entity_key, canonical_name, status
--   narrative_entity_aliases: project_id, canonical_entity_id, alias_name
--   narrative_scene_entity_links: entity_id → FK to narrative_entities
--   narrative_entity_mentions:    entity_id → FK to narrative_entities
--   project_canon:              canon_json (JSONB) with 'characters' array
-- ============================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- A. Insert aliases: 'Brother' → Enki, 'Boy' → Enki
-- ══════════════════════════════════════════════════════════════════════════════
-- Pattern from 20260412101500_narrative_entity_aliases.sql: SELECT with CROSS JOIN VALUES
-- Only inserts for projects that have ALL THREE entities (enki + brother + boy)
-- ON CONFLICT DO NOTHING ensures idempotency

INSERT INTO public.narrative_entity_aliases (project_id, canonical_entity_id, alias_name, source, confidence, reason)
SELECT
  enki.project_id,
  enki.id,
  v.alias_name,
  'manual',
  1.0,
  'Consolidation: ' || v.alias_name || ' → Enki (duplicate character merge)'
FROM narrative_entities enki
CROSS JOIN (VALUES
  ('Brother'),
  ('Boy')
) AS v(alias_name)
WHERE enki.entity_key = 'char_enki'
  AND enki.status = 'active'
  -- Only proceed if both brother and boy exist for this project (any status)
  AND EXISTS (
    SELECT 1 FROM narrative_entities brother
    WHERE brother.project_id = enki.project_id
      AND brother.entity_key = 'char_brother'
  )
  AND EXISTS (
    SELECT 1 FROM narrative_entities boy
    WHERE boy.project_id = enki.project_id
      AND boy.entity_key = 'char_boy'
  )
ON CONFLICT (project_id, alias_name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- B. Re-parent scene_entity_links: Brother/Boy → Enki
-- ══════════════════════════════════════════════════════════════════════════════
-- Currently 0 links for project 1983a0ee, but written generically for all YETI projects.

DO $$
DECLARE
  rec RECORD;
  link_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT DISTINCT enki.project_id, enki.id AS enki_id
    FROM narrative_entities enki
    WHERE enki.entity_key = 'char_enki'
      AND enki.status = 'active'
  LOOP
    -- Re-parent scene_entity_links from Brother → Enki
    UPDATE public.narrative_scene_entity_links nsel
    SET entity_id = rec.enki_id,
        updated_at = now()
    FROM narrative_entities brother
    WHERE brother.project_id = rec.project_id
      AND brother.entity_key = 'char_brother'
      AND brother.status = 'active'
      AND nsel.entity_id = brother.id
      AND nsel.project_id = rec.project_id;

    GET DIAGNOSTICS link_count = ROW_COUNT;
    IF link_count > 0 THEN
      RAISE NOTICE 'Re-parented % scene_entity_links from Brother→Enki for project %', link_count, rec.project_id;
    END IF;

    -- Re-parent scene_entity_links from Boy → Enki
    UPDATE public.narrative_scene_entity_links nsel
    SET entity_id = rec.enki_id,
        updated_at = now()
    FROM narrative_entities boy
    WHERE boy.project_id = rec.project_id
      AND boy.entity_key = 'char_boy'
      AND boy.status = 'active'
      AND nsel.entity_id = boy.id
      AND nsel.project_id = rec.project_id;

    GET DIAGNOSTICS link_count = ROW_COUNT;
    IF link_count > 0 THEN
      RAISE NOTICE 'Re-parented % scene_entity_links from Boy→Enki for project %', link_count, rec.project_id;
    END IF;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- C. Re-parent entity_mentions: Brother/Boy → Enki
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
  mention_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT DISTINCT enki.project_id, enki.id AS enki_id
    FROM narrative_entities enki
    WHERE enki.entity_key = 'char_enki'
      AND enki.status = 'active'
  LOOP
    -- Re-parent entity_mentions from Brother → Enki
    UPDATE public.narrative_entity_mentions nem
    SET entity_id = rec.enki_id
    FROM narrative_entities brother
    WHERE brother.project_id = rec.project_id
      AND brother.entity_key = 'char_brother'
      AND brother.status = 'active'
      AND nem.entity_id = brother.id
      AND nem.project_id = rec.project_id;

    GET DIAGNOSTICS mention_count = ROW_COUNT;
    IF mention_count > 0 THEN
      RAISE NOTICE 'Re-parented % entity_mentions from Brother→Enki for project %', mention_count, rec.project_id;
    END IF;

    -- Re-parent entity_mentions from Boy → Enki
    UPDATE public.narrative_entity_mentions nem
    SET entity_id = rec.enki_id
    FROM narrative_entities boy
    WHERE boy.project_id = rec.project_id
      AND boy.entity_key = 'char_boy'
      AND boy.status = 'active'
      AND nem.entity_id = boy.id
      AND nem.project_id = rec.project_id;

    GET DIAGNOSTICS mention_count = ROW_COUNT;
    IF mention_count > 0 THEN
      RAISE NOTICE 'Re-parented % entity_mentions from Boy→Enki for project %', mention_count, rec.project_id;
    END IF;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- D. Set Brother and Boy status to 'stale'
-- ══════════════════════════════════════════════════════════════════════════════
-- Per the constraint: CHECK (status = ANY (ARRAY['active'::text, 'stale'::text, 'retired'::text]))
-- Excludes 'retired' to preserve explicit intent. Idempotent: uses AND status != 'stale'.

UPDATE narrative_entities
SET status = 'stale',
    updated_at = now()
WHERE entity_key IN ('char_brother', 'char_boy')
  AND status != 'stale'
  AND status != 'retired';

-- ══════════════════════════════════════════════════════════════════════════════
-- E. Clean up project_canon.canon_json->'characters' array
--    Remove entries where name = 'Brother' or 'Boy' from ALL projects
-- ══════════════════════════════════════════════════════════════════════════════
-- Uses JSONB filtering via jsonb_array_elements. Loops over ALL projects.
-- Keep the surviving Enki and Sister entries (and any other non-Brother/Boy entries).
--
-- The auto_version_canon trigger on project_canon will automatically record a
-- canon_versions row for each update, preserving the full history.

DO $$
DECLARE
  rec RECORD;
  filtered JSONB;
  old_chars JSONB;
  removed_brother BOOLEAN;
  removed_boy BOOLEAN;
  update_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT pc.project_id, pc.canon_json
    FROM public.project_canon pc
    WHERE pc.canon_json ? 'characters'
      AND jsonb_typeof(pc.canon_json->'characters') = 'array'
      AND pc.canon_json->'characters' IS NOT NULL
      AND pc.canon_json->'characters' != '[]'::jsonb
  LOOP
    old_chars := rec.canon_json->'characters';

    -- Filter out Brother and Boy entries
    SELECT jsonb_agg(elem)
    INTO filtered
    FROM jsonb_array_elements(old_chars) AS elem
    WHERE elem->>'name' NOT IN ('Brother', 'Boy');

    -- Check if anything was actually removed
    removed_brother := EXISTS (
      SELECT 1 FROM jsonb_array_elements(old_chars) AS elem
      WHERE elem->>'name' = 'Brother'
    );
    removed_boy := EXISTS (
      SELECT 1 FROM jsonb_array_elements(old_chars) AS elem
      WHERE elem->>'name' = 'Boy'
    );

    -- Only update if we actually removed something
    IF (removed_brother OR removed_boy) AND filtered IS DISTINCT FROM old_chars THEN
      UPDATE public.project_canon
      SET canon_json = jsonb_set(
        rec.canon_json,
        '{characters}',
        COALESCE(filtered, '[]'::jsonb),
        false
      ),
          updated_at = now()
      WHERE project_id = rec.project_id;

      GET DIAGNOSTICS update_count = ROW_COUNT;
      RAISE NOTICE 'Canon_json cleaned: removed Brother/Boy from project % (% row(s))', rec.project_id, update_count;
    END IF;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- F. Handle Sister/Girl edge case
--    If a project has both 'Sister' and 'Girl' in its characters array,
--    merge by removing 'Girl' (Sister is the canonical name).
--    Also handles the case where 'Girl' exists but 'Sister' doesn't —
--    renames 'Girl' to 'Sister' in that scenario.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
  filtered JSONB;
  old_chars JSONB;
  has_sister BOOLEAN;
  has_girl BOOLEAN;
  update_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT pc.project_id, pc.canon_json
    FROM public.project_canon pc
    WHERE pc.canon_json ? 'characters'
      AND jsonb_typeof(pc.canon_json->'characters') = 'array'
      AND pc.canon_json->'characters' IS NOT NULL
      AND pc.canon_json->'characters' != '[]'::jsonb
  LOOP
    old_chars := rec.canon_json->'characters';

    -- Check what exists
    has_sister := EXISTS (
      SELECT 1 FROM jsonb_array_elements(old_chars) AS elem
      WHERE elem->>'name' = 'Sister'
    );
    has_girl := EXISTS (
      SELECT 1 FROM jsonb_array_elements(old_chars) AS elem
      WHERE elem->>'name' = 'Girl'
    );

    CONTINUE WHEN NOT has_girl;  -- No Girl entry, nothing to do

    IF has_sister THEN
      -- Both Sister and Girl exist: remove Girl (Sister is canonical)
      SELECT jsonb_agg(elem)
      INTO filtered
      FROM jsonb_array_elements(old_chars) AS elem
      WHERE elem->>'name' != 'Girl';

      IF filtered IS DISTINCT FROM old_chars THEN
        UPDATE public.project_canon
        SET canon_json = jsonb_set(
          rec.canon_json,
          '{characters}',
          COALESCE(filtered, '[]'::jsonb),
          false
        ),
            updated_at = now()
        WHERE project_id = rec.project_id;

        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Sister/Girl merge: removed Girl (Sister exists) from project % (% row(s))', rec.project_id, update_count;
      END IF;
    ELSE
      -- Only Girl exists (no Sister): rename Girl to Sister
      SELECT jsonb_agg(
        CASE WHEN elem->>'name' = 'Girl'
          THEN elem || '{"name": "Sister"}'::jsonb
          ELSE elem
        END
      )
      INTO filtered
      FROM jsonb_array_elements(old_chars) AS elem;

      IF filtered IS DISTINCT FROM old_chars THEN
        UPDATE public.project_canon
        SET canon_json = jsonb_set(
          rec.canon_json,
          '{characters}',
          COALESCE(filtered, '[]'::jsonb),
          false
        ),
            updated_at = now()
        WHERE project_id = rec.project_id;

        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Sister/Girl merge: renamed Girl→Sister in project % (% row(s))', rec.project_id, update_count;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- G. Create lookup index on narrative_entities.canonical_name
--    Speeds up the generate-document dedup guardrail query which joins
--    narrative_entity_aliases → narrative_entities by canonical_entity_id.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_ne_canonical_name_lookup
  ON public.narrative_entities (project_id, canonical_name);

-- ══════════════════════════════════════════════════════════════════════════════
-- Summary logging
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  alias_count INTEGER;
  stale_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO alias_count
  FROM public.narrative_entity_aliases
  WHERE alias_name IN ('Brother', 'Boy')
    AND source = 'manual';

  SELECT COUNT(*) INTO stale_count
  FROM public.narrative_entities
  WHERE entity_key IN ('char_brother', 'char_boy')
    AND status = 'stale';

  RAISE NOTICE '=== Merge Duplicate YETI Characters Summary ===';
  RAISE NOTICE 'Aliases inserted: %', alias_count;
  RAISE NOTICE 'Entities marked stale: %', stale_count;
  RAISE NOTICE 'Migration complete.';
END $$;