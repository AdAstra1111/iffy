
-- Costume Run Commands: persisted command/control layer for costume generation runs
CREATE TABLE IF NOT EXISTS public.costume_run_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  command_type text NOT NULL CHECK (command_type IN ('pause_run', 'resume_run', 'retry_state', 'skip_state', 'retry_slot')),
  character_key text,
  state_key text,
  slot_key text,
  payload_json jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed', 'cancelled')),
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  result_json jsonb,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE
);

-- Index for executor polling: fetch pending commands for a run
CREATE INDEX IF NOT EXISTS idx_costume_run_commands_pending ON public.costume_run_commands (run_id, status) WHERE status = 'pending';

-- Index for project-level audit
CREATE INDEX IF NOT EXISTS idx_costume_run_commands_project ON public.costume_run_commands (project_id, created_at DESC);

-- RLS
ALTER TABLE public.costume_run_commands ENABLE ROW LEVEL SECURITY;

-- Owner/collaborator access via existing helper
CREATE POLICY "Users can manage their project commands"
  ON public.costume_run_commands
  FOR ALL
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));
