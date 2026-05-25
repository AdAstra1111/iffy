-- Migration: Add execution_result_json to repair intents
-- Purpose: Stores execution output for completed or failed repair intents.

ALTER TABLE public.project_visual_repair_intents
  ADD COLUMN IF NOT EXISTS execution_result_json jsonb DEFAULT NULL;

COMMENT ON COLUMN public.project_visual_repair_intents.execution_result_json IS
  'JSON result from intent execution: {status, output?, error?, evaluated_at?, stages_count?}';