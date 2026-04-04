
-- Add generation_epoch to visual_sets, visual_set_slots, visual_set_candidates, project_images
ALTER TABLE public.visual_sets
  ADD COLUMN IF NOT EXISTS generation_epoch integer NOT NULL DEFAULT 1;

ALTER TABLE public.visual_set_slots
  ADD COLUMN IF NOT EXISTS generation_epoch integer NOT NULL DEFAULT 1;

ALTER TABLE public.visual_set_candidates
  ADD COLUMN IF NOT EXISTS generation_epoch integer NOT NULL DEFAULT 1;

ALTER TABLE public.project_images
  ADD COLUMN IF NOT EXISTS generation_epoch integer NOT NULL DEFAULT 1;

-- Add reset audit columns to visual_sets
ALTER TABLE public.visual_sets
  ADD COLUMN IF NOT EXISTS reset_reason text,
  ADD COLUMN IF NOT EXISTS reset_by uuid,
  ADD COLUMN IF NOT EXISTS reset_at timestamptz;

-- Create the atomic reset function
CREATE OR REPLACE FUNCTION public.reset_costume_generation(
  p_project_id uuid,
  p_reason text DEFAULT 'Manual reset for clean generation',
  p_reset_by uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_epoch integer;
  v_new_epoch integer;
  v_archived_sets integer := 0;
  v_archived_slots integer := 0;
  v_archived_candidates integer := 0;
  v_archived_images integer := 0;
  v_set record;
BEGIN
  -- 1. Get current max epoch for this project's costume sets
  SELECT COALESCE(MAX(generation_epoch), 1) INTO v_current_epoch
  FROM public.visual_sets
  WHERE project_id = p_project_id
    AND domain = 'character_costume_look';

  v_new_epoch := v_current_epoch + 1;

  -- 2. Archive all existing costume sets (mark as archived, stamp reset metadata)
  UPDATE public.visual_sets
  SET status = 'archived',
      reset_reason = p_reason,
      reset_by = p_reset_by,
      reset_at = now(),
      updated_at = now()
  WHERE project_id = p_project_id
    AND domain = 'character_costume_look'
    AND status != 'archived';
  GET DIAGNOSTICS v_archived_sets = ROW_COUNT;

  -- 3. Archive all slots for those sets (set state to 'archived', clear convergence)
  UPDATE public.visual_set_slots s
  SET state = 'archived',
      best_score = NULL,
      best_candidate_id = NULL,
      selected_image_id = NULL,
      attempt_count = 0,
      convergence_state = jsonb_build_object(
        'archived_by_reset', true,
        'previous_epoch', v_current_epoch,
        'reset_at', now()::text
      )
  FROM public.visual_sets vs
  WHERE s.visual_set_id = vs.id
    AND vs.project_id = p_project_id
    AND vs.domain = 'character_costume_look';
  GET DIAGNOSTICS v_archived_slots = ROW_COUNT;

  -- 4. Deselect all candidates (preserve rows but mark inactive)
  UPDATE public.visual_set_candidates c
  SET selected_for_slot = false,
      producer_decision = 'archived_by_reset'
  FROM public.visual_set_slots s
  JOIN public.visual_sets vs ON s.visual_set_id = vs.id
  WHERE c.visual_set_slot_id = s.id
    AND vs.project_id = p_project_id
    AND vs.domain = 'character_costume_look';
  GET DIAGNOSTICS v_archived_candidates = ROW_COUNT;

  -- 5. Epoch-stamp costume images (don't delete, just mark old epoch)
  UPDATE public.project_images
  SET is_active = false,
      curation_state = 'archived'
  WHERE project_id = p_project_id
    AND asset_group = 'character'
    AND generation_purpose = 'costume_look'
    AND is_active = true
    AND generation_epoch < v_new_epoch;
  GET DIAGNOSTICS v_archived_images = ROW_COUNT;

  -- 6. Bump epoch on all affected rows
  UPDATE public.visual_sets
  SET generation_epoch = v_current_epoch
  WHERE project_id = p_project_id
    AND domain = 'character_costume_look'
    AND status = 'archived'
    AND reset_at IS NOT NULL;

  RETURN jsonb_build_object(
    'success', true,
    'previous_epoch', v_current_epoch,
    'new_epoch', v_new_epoch,
    'archived_sets', v_archived_sets,
    'archived_slots', v_archived_slots,
    'archived_candidates', v_archived_candidates,
    'archived_images', v_archived_images,
    'reset_reason', p_reason,
    'reset_at', now()
  );
END;
$$;
