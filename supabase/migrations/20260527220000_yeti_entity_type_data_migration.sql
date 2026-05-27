-- P0: YETI project — set Yeti canon entry entity_type to 'creature'
--
-- Sets entity_type='creature' on the Yeti character in project_canon
-- for project 6b145f62-d482-4cd4-99cc-0ea57079d98a.
-- Must run AFTER the entity_type CHECK constraint has been expanded (20260527210000).

DO $$
DECLARE
  canon_json_val jsonb;
  entry_idx int;
BEGIN
  -- Fetch current canon_json
  SELECT canon_json INTO canon_json_val
  FROM public.project_canon
  WHERE project_id = '6b145f62-d482-4cd4-99cc-0ea57079d98a'
  FOR UPDATE;

  IF canon_json_val IS NULL THEN
    RAISE NOTICE 'YETI project (6b145f62) has no canon_json — skipping data migration';
    RETURN;
  END IF;

  -- Find the Yeti entry in characters[] and set entity_type if not already set
  entry_idx := 0;
  WHILE entry_idx < jsonb_array_length(canon_json_val->'characters') LOOP
    IF canon_json_val->'characters'->entry_idx->>'name' = 'Yeti' THEN
      -- Entity_type not set yet or still default — set to creature
      IF (canon_json_val->'characters'->entry_idx->'entity_type') IS NULL
         OR canon_json_val->'characters'->entry_idx->>'entity_type' = 'character'
      THEN
        canon_json_val := jsonb_set(
          canon_json_val,
          ARRAY['characters', entry_idx::text, 'entity_type'],
          '"creature"'::jsonb
        );
        UPDATE public.project_canon
        SET canon_json = canon_json_val
        WHERE project_id = '6b145f62-d482-4cd4-99cc-0ea57079d98a';
        RAISE NOTICE 'Set Yeti entity_type to creature for project 6b145f62';
      ELSE
        RAISE NOTICE 'Yeti entity_type already set to %', canon_json_val->'characters'->entry_idx->>'entity_type';
      END IF;
      RETURN;
    END IF;
    entry_idx := entry_idx + 1;
  END LOOP;

  RAISE NOTICE 'Yeti not found in characters[] — check character name';
END $$;
