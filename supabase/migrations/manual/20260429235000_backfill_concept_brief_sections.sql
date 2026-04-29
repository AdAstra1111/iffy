-- Migration: 20260429235000_backfill_concept_brief_sections.sql
-- Backfill concept_brief_sections for Name on a Thread (project_id = 79d75f1b-ca6f-477f-8ebb-35c71e9054f1)
-- Safe to re-run: uses ON CONFLICT DO NOTHING for idempotency.

DO $$
DECLARE
  v_doc_id UUID;
  v_version_id UUID;
  v_plaintext TEXT;
  v_meta JSONB;
  v_ci NUMERIC;
  v_gp NUMERIC;
  v_count INTEGER := 0;

  -- Section patterns: (header_regex, section_key, label)
  v_patterns JSONB := '[
    ["(?i)^[#\\s]*logline\\s*$", "logline", "Logline"],
    ["(?i)^[#\\s]*premise\\s*$", "premise", "Premise"],
    ["(?i)^[#\\s]*protagonist\\s*$", "protagonist", "Protagonist"],
    ["(?i)^[#\\s]*(central question|central_conflict)\\s*$", "central_conflict", "Central Conflict"],
    ["(?i)^[#\\s]*tone\\s*$", "tone_and_style", "Tone & Style"],
    ["(?i)^[#\\s]*(audience|target audience)\\s*$", "audience", "Audience"],
    ["(?i)^[#\\s]*hook\\s*$", "unique_hook", "Unique Hook"],
    ["(?i)^[#\\s]*world\\s*$", "world_building_notes", "World Building Notes"]
  ]'::JSONB;

  v_pat RECORD;
  v_header_pos INTEGER;
  v_next_header_pos INTEGER;
  v_section_text TEXT;
  v_key TEXT;
  v_label TEXT;
  v_i INTEGER;
BEGIN
  -- Find concept_brief document for Name on a Thread
  SELECT id INTO v_doc_id FROM project_documents
  WHERE project_id = '79d75f1b-ca6f-477f-8ebb-35c71e9054f1' AND doc_type = 'concept_brief'
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RAISE NOTICE 'No concept_brief found for Name on a Thread';
    RETURN;
  END IF;

  -- Get latest version
  SELECT id, plaintext, meta_json INTO v_version_id, v_plaintext, v_meta
  FROM project_document_versions
  WHERE document_id = v_doc_id
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_plaintext IS NULL OR v_plaintext = '' THEN
    RAISE NOTICE 'No plaintext found';
    RETURN;
  END IF;

  v_ci := (v_meta->>'ci')::NUMERIC;
  v_gp := (v_meta->>'gp')::NUMERIC;

  -- Parse each section
  FOR v_i IN 0..(jsonb_array_length(v_patterns)-1) LOOP
    SELECT
      (v_patterns->v_i->>0)::TEXT,
      (v_patterns->v_i->>1)::TEXT,
      (v_patterns->v_i->>2)::TEXT
    INTO v_pat.pat, v_key, v_label;

    SELECT substring(v_plaintext FROM pat.pos FOR
      CASE WHEN pat.next_pos = 0 THEN length(v_plaintext) - pat.pos + 1
           ELSE pat.next_pos - pat.pos END
    )
    INTO v_section_text
    FROM (
      SELECT
        regexp_instr(v_plaintext, v_pat.pat, 0, 1, 0, 'm') as pos,
        CASE
          WHEN regexp_instr(v_plaintext, v_pat.pat, 0, 1, 1, 'm') = 0 THEN 0
          ELSE regexp_instr(v_plaintext, v_pat.pat, 0, 1, 1, 'm')
        END as next_pos
    ) as pat
    WHERE pat.pos > 0;

    IF v_section_text IS NOT NULL AND length(v_section_text) > 10 THEN
      -- Strip the header line
      v_section_text := trim(regexp_replace(v_section_text, v_pat.pat, '', 'i', 1));
      v_section_text := trim(regexp_replace(v_section_text, '^[#\\s]+', ''));

      INSERT INTO concept_brief_sections (
        project_id, version_id, section_key, section_label, plaintext,
        status, convergence_score_json, rewrite_attempts
      ) VALUES (
        '79d75f1b-ca6f-477f-8ebb-35c71e9054f1',
        v_version_id,
        v_key,
        v_label,
        v_section_text,
        'complete',
        jsonb_build_object('ci', v_ci, 'gp', v_gp, 'blockers', 0),
        0
      )
      ON CONFLICT (version_id, section_key) DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfilled % sections for Name on a Thread v%', v_count, v_version_id;
END $$;
