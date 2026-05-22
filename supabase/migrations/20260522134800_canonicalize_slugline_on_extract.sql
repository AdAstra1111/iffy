-- 20260522134800_canonicalize_slugline_on_extract.sql
--
-- Two changes:
--   1. scene_graph_atomic_write now writes slugline column to
--      scene_graph_scenes during extraction (previously only written
--      to scene_graph_versions). The data was already in the RPC payload.
--   2. Added enrichment columns: slugline, act, act_label,
--      page_range_start, page_range_end, source_text_refs
--
-- This is the pipeline wiring fix: sluglines are now persisted at
-- extraction time so downstream canonicalization doesn't need to
-- re-parse the script for sluglines.

-- ── Add enrichment columns (safe: IF NOT EXISTS) ─────────────────────────────
ALTER TABLE public.scene_graph_scenes
  ADD COLUMN IF NOT EXISTS slugline text NULL;

ALTER TABLE public.scene_graph_scenes
  ADD COLUMN IF NOT EXISTS act integer NULL;

ALTER TABLE public.scene_graph_scenes
  ADD COLUMN IF NOT EXISTS act_label text NULL;

ALTER TABLE public.scene_graph_scenes
  ADD COLUMN IF NOT EXISTS page_range_start integer NULL;

ALTER TABLE public.scene_graph_scenes
  ADD COLUMN IF NOT EXISTS page_range_end integer NULL;

ALTER TABLE public.scene_graph_scenes
  ADD COLUMN IF NOT EXISTS source_text_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.scene_graph_scenes.slugline IS
  'Canonical slugline (INT./EXT. heading). Written during extraction from scene_graph_atomic_write.';
COMMENT ON COLUMN public.scene_graph_scenes.act IS
  'Assigned act number (1-based). Populated by canonicalize-scene-substrate.';
COMMENT ON COLUMN public.scene_graph_scenes.act_label IS
  'Human-readable act label (e.g. ACT 1, ACT 2). Populated by canonicalize-scene-substrate.';

-- ── Update scene_graph_atomic_write to persist slugline on scene ─────────────
CREATE OR REPLACE FUNCTION public.scene_graph_atomic_write(
  p_project_id uuid,
  p_created_by uuid,
  p_force boolean DEFAULT false,
  p_scenes jsonb DEFAULT '[]'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_entry    jsonb;
  v_scene    record;
  v_version  record;
  v_results  jsonb := '[]'::jsonb;
  v_location text;
  v_norm     text;
  v_canon_id uuid;
  v_match_count int;
BEGIN
  IF p_force THEN
    DELETE FROM public.scene_graph_snapshots WHERE project_id = p_project_id;
    DELETE FROM public.scene_graph_scenes    WHERE project_id = p_project_id;
  END IF;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_scenes) LOOP
    INSERT INTO public.scene_graph_scenes (project_id, scene_kind, scene_key, created_by, slugline)
    VALUES (
      p_project_id,
      COALESCE(v_entry->>'scene_kind','narrative'),
      v_entry->>'scene_key',
      p_created_by,
      COALESCE(NULLIF(v_entry->>'slugline',''), NULL)
    )
    RETURNING * INTO v_scene;

    v_location := COALESCE(BTRIM(v_entry->>'location'), '');
    v_canon_id := NULL;
    IF v_location != '' THEN
      v_norm := lower(regexp_replace(v_location, '[^a-zA-Z0-9]+', '_', 'g'));
      v_norm := trim(both '_' from v_norm);
      SELECT count(*) INTO v_match_count
      FROM public.canon_locations
      WHERE project_id = p_project_id AND normalized_name = v_norm AND active = true;
      IF v_match_count = 1 THEN
        SELECT id INTO v_canon_id
        FROM public.canon_locations
        WHERE project_id = p_project_id AND normalized_name = v_norm AND active = true;
      END IF;
    END IF;

    INSERT INTO public.scene_graph_versions (scene_id, project_id, version_number, status, created_by, slugline, location, time_of_day, content, summary, canon_location_id)
    VALUES (v_scene.id, p_project_id, 1, 'draft', p_created_by,
      COALESCE(v_entry->>'slugline',''), COALESCE(v_entry->>'location',''),
      COALESCE(v_entry->>'time_of_day',''), COALESCE(v_entry->>'content',''), COALESCE(v_entry->>'summary',''), v_canon_id)
    RETURNING * INTO v_version;

    INSERT INTO public.scene_graph_order (project_id, scene_id, order_key, is_active, act)
    VALUES (p_project_id, v_scene.id, v_entry->>'order_key', true, NULL);

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'scene_id', v_scene.id, 'scene_key', v_scene.scene_key,
      'version_id', v_version.id, 'order_key', v_entry->>'order_key'
    ));
  END LOOP;
  RETURN v_results;
END;
$$;