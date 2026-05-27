-- Drop broken set_updated_at trigger from project_visual_stage_governance
-- The table uses last_evaluated_at, not updated_at.
-- set_updated_at() unconditionally sets NEW.updated_at which doesn't exist on this table,
-- causing every upsert to fail with "record "new" has no field "updated_at"".

DROP TRIGGER IF EXISTS set_visual_governance_updated_at
  ON public.project_visual_stage_governance;

-- Also verify the set_updated_at function handles missing columns gracefully
-- for any future tables that use this pattern without an updated_at column
-- NOTE: The function itself is shared by 50+ other tables that DO have updated_at.
-- We don't modify it here to avoid breaking those.