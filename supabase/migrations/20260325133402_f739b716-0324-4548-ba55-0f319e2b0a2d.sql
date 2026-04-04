
-- Fix lock_visual_set to also promote locked slot images to active in project_images
CREATE OR REPLACE FUNCTION public.lock_visual_set(p_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_set record;
  v_user_id uuid;
  v_slot record;
  v_blocking_reasons text[] := '{}';
  v_required_total int := 0;
  v_required_approved int := 0;
  v_archived_ids uuid[] := '{}';
  v_locked_image_ids uuid[] := '{}';
  v_eval record;
  v_dna_current boolean;
  v_requires_evaluation boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'blocking_reasons', ARRAY['Not authenticated']);
  END IF;

  -- 1. Lock the set row
  SELECT * INTO v_set FROM public.visual_sets WHERE id = p_set_id FOR UPDATE;
  IF v_set IS NULL THEN
    RETURN jsonb_build_object('success', false, 'blocking_reasons', ARRAY['Set not found']);
  END IF;

  IF v_set.status = 'locked' THEN
    RETURN jsonb_build_object('success', false, 'blocking_reasons', ARRAY['Set already locked']);
  END IF;

  v_requires_evaluation := v_set.domain IN ('character_identity', 'character_costume_look');

  -- 2. DNA provenance check for character sets
  IF v_set.domain = 'character_identity' AND v_set.current_dna_version_id IS NULL THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'Character set requires DNA version');
  END IF;

  -- 3. Check DNA is still current
  IF v_set.current_dna_version_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.character_visual_dna
      WHERE id = v_set.current_dna_version_id AND is_current = true
    ) INTO v_dna_current;
    IF NOT v_dna_current THEN
      v_blocking_reasons := array_append(v_blocking_reasons, 'DNA version is stale — re-evaluate required');
    END IF;
  END IF;

  -- 4. Validate all slots
  FOR v_slot IN
    SELECT * FROM public.visual_set_slots WHERE visual_set_id = p_set_id ORDER BY created_at
  LOOP
    IF v_slot.is_required THEN
      v_required_total := v_required_total + 1;

      IF v_slot.selected_image_id IS NULL THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'Required slot "' || v_slot.slot_label || '" has no selected image');
        CONTINUE;
      END IF;

      IF v_slot.state NOT IN ('approved') THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'Required slot "' || v_slot.slot_label || '" is not approved (state: ' || v_slot.state || ')');
        CONTINUE;
      END IF;

      IF v_requires_evaluation THEN
        SELECT * INTO v_eval FROM public.image_evaluations
          WHERE project_id = v_set.project_id
            AND image_id = v_slot.selected_image_id
          ORDER BY created_at DESC, id DESC
          LIMIT 1;

        IF v_eval IS NULL THEN
          v_blocking_reasons := array_append(v_blocking_reasons, 'Slot "' || v_slot.slot_label || '" has no evaluation');
          CONTINUE;
        END IF;

        IF v_eval.governance_verdict IN ('flagged', 'rejected') THEN
          v_blocking_reasons := array_append(v_blocking_reasons, 'Slot "' || v_slot.slot_label || '" evaluation is ' || v_eval.governance_verdict);
          CONTINUE;
        END IF;

        IF v_eval.governance_verdict NOT IN ('approved', 'review_required') THEN
          v_blocking_reasons := array_append(v_blocking_reasons, 'Slot "' || v_slot.slot_label || '" evaluation verdict is ' || COALESCE(v_eval.governance_verdict, 'pending'));
          CONTINUE;
        END IF;

        IF v_set.current_dna_version_id IS NOT NULL AND
           (v_eval.dna_version_id IS NULL OR v_eval.dna_version_id != v_set.current_dna_version_id) THEN
          v_blocking_reasons := array_append(v_blocking_reasons, 'Slot "' || v_slot.slot_label || '" evaluation DNA version mismatch');
          CONTINUE;
        END IF;
      END IF;

      v_required_approved := v_required_approved + 1;
    END IF;
  END LOOP;

  -- 6. If any blocking reasons, abort entirely
  IF array_length(v_blocking_reasons, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'set_id', p_set_id,
      'required_total', v_required_total,
      'required_approved', v_required_approved,
      'blocking_reasons', v_blocking_reasons
    );
  END IF;

  -- 7. Lock all slots
  UPDATE public.visual_set_slots SET state = 'locked'
    WHERE visual_set_id = p_set_id AND state IN ('approved', 'candidate_present');

  -- 7b. Collect all selected image IDs from locked slots
  SELECT array_agg(selected_image_id) INTO v_locked_image_ids
  FROM public.visual_set_slots
  WHERE visual_set_id = p_set_id
    AND selected_image_id IS NOT NULL;

  -- 7c. CANONICAL WRITE-BACK: Promote locked slot images to active in project_images
  -- This ensures downstream Lookbook queries can discover locked PD outputs.
  IF v_locked_image_ids IS NOT NULL AND array_length(v_locked_image_ids, 1) > 0 THEN
    UPDATE public.project_images
    SET curation_state = 'active', is_active = true
    WHERE id = ANY(v_locked_image_ids)
      AND curation_state != 'active';
  END IF;

  -- 8. Lock the set
  UPDATE public.visual_sets SET
    status = 'locked',
    locked_at = now(),
    locked_by = v_user_id
  WHERE id = p_set_id;

  -- 9. Archive only equivalent prior sets (target-scoped, not domain-wide)
  WITH archived AS (
    UPDATE public.visual_sets SET status = 'archived'
    WHERE project_id = v_set.project_id
      AND domain = v_set.domain
      AND target_type = v_set.target_type
      AND id != p_set_id
      AND status NOT IN ('locked', 'archived')
      AND (
        (v_set.target_id IS NOT NULL AND target_id = v_set.target_id)
        OR (v_set.target_id IS NULL AND target_name = v_set.target_name)
      )
    RETURNING id
  )
  SELECT array_agg(id) INTO v_archived_ids FROM archived;

  RETURN jsonb_build_object(
    'success', true,
    'set_id', p_set_id,
    'locked_slot_count', v_required_approved,
    'archived_set_ids', COALESCE(v_archived_ids, '{}'),
    'promoted_image_count', COALESCE(array_length(v_locked_image_ids, 1), 0)
  );
END;
$function$;

-- LIVE DATA FIX: Promote all images referenced by locked visual_set_slots to active
-- This reconciles the current state where locked PD images are incorrectly archived
UPDATE public.project_images pi
SET curation_state = 'active', is_active = true
FROM public.visual_set_slots vss
JOIN public.visual_sets vs ON vs.id = vss.visual_set_id
WHERE pi.id = vss.selected_image_id
  AND vss.state = 'locked'
  AND vs.status = 'locked'
  AND pi.curation_state = 'archived';
