
-- 1. Create costume_runs table for persisted run identity
CREATE TABLE IF NOT EXISTS public.costume_runs (
  id TEXT PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'aborted')),
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.costume_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own project costume runs"
  ON public.costume_runs
  FOR ALL
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id))
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE INDEX IF NOT EXISTS idx_costume_runs_project_status ON public.costume_runs(project_id, status);

-- 2. Create atomic command consumption RPC
CREATE OR REPLACE FUNCTION public.consume_next_costume_command(
  p_project_id UUID,
  p_run_id TEXT,
  p_character_key TEXT DEFAULT NULL,
  p_state_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cmd RECORD;
  v_action TEXT;
BEGIN
  -- Priority 1: pause_run (global, no context match needed)
  SELECT * INTO v_cmd
  FROM public.costume_run_commands
  WHERE project_id = p_project_id
    AND run_id = p_run_id
    AND status = 'pending'
    AND command_type = 'pause_run'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_cmd.id IS NOT NULL THEN
    UPDATE public.costume_run_commands
    SET status = 'applied',
        consumed_at = now(),
        result_json = jsonb_build_object('action', 'pause')
    WHERE id = v_cmd.id;

    -- Also update costume_runs status to paused
    UPDATE public.costume_runs
    SET status = 'paused', updated_at = now()
    WHERE id = p_run_id AND project_id = p_project_id;

    RETURN jsonb_build_object(
      'action', 'pause',
      'command_id', v_cmd.id,
      'reason', v_cmd.reason
    );
  END IF;

  -- Priority 2: skip_state (context-matched)
  IF p_character_key IS NOT NULL AND p_state_key IS NOT NULL THEN
    SELECT * INTO v_cmd
    FROM public.costume_run_commands
    WHERE project_id = p_project_id
      AND run_id = p_run_id
      AND status = 'pending'
      AND command_type = 'skip_state'
      AND character_key = p_character_key
      AND state_key = p_state_key
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_cmd.id IS NOT NULL THEN
      UPDATE public.costume_run_commands
      SET status = 'applied',
          consumed_at = now(),
          result_json = jsonb_build_object('action', 'skip_state')
      WHERE id = v_cmd.id;

      RETURN jsonb_build_object(
        'action', 'skip_state',
        'command_id', v_cmd.id,
        'reason', v_cmd.reason
      );
    END IF;
  END IF;

  -- Priority 3: retry_state (context-matched)
  IF p_character_key IS NOT NULL AND p_state_key IS NOT NULL THEN
    SELECT * INTO v_cmd
    FROM public.costume_run_commands
    WHERE project_id = p_project_id
      AND run_id = p_run_id
      AND status = 'pending'
      AND command_type = 'retry_state'
      AND character_key = p_character_key
      AND state_key = p_state_key
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_cmd.id IS NOT NULL THEN
      UPDATE public.costume_run_commands
      SET status = 'applied',
          consumed_at = now(),
          result_json = jsonb_build_object('action', 'retry_state')
      WHERE id = v_cmd.id;

      RETURN jsonb_build_object(
        'action', 'retry_state',
        'command_id', v_cmd.id,
        'reason', v_cmd.reason
      );
    END IF;
  END IF;

  -- No pending command found
  RETURN jsonb_build_object('action', 'none');
END;
$$;

-- 3. Add RPC for resume (updates run status atomically)
CREATE OR REPLACE FUNCTION public.resume_costume_run(
  p_project_id UUID,
  p_run_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cmd RECORD;
BEGIN
  -- Consume the resume_run command
  SELECT * INTO v_cmd
  FROM public.costume_run_commands
  WHERE project_id = p_project_id
    AND run_id = p_run_id
    AND status = 'pending'
    AND command_type = 'resume_run'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_cmd.id IS NOT NULL THEN
    UPDATE public.costume_run_commands
    SET status = 'applied',
        consumed_at = now(),
        result_json = jsonb_build_object('action', 'resume')
    WHERE id = v_cmd.id;
  END IF;

  -- Update run status regardless (idempotent)
  UPDATE public.costume_runs
  SET status = 'running', updated_at = now()
  WHERE id = p_run_id AND project_id = p_project_id AND status = 'paused';

  RETURN jsonb_build_object(
    'resumed', true,
    'command_id', v_cmd.id
  );
END;
$$;
