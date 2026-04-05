-- Create note_threads table (missing from original migrations)
CREATE TABLE IF NOT EXISTS public.note_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  title text,
  status text NOT NULL DEFAULT 'open',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.note_threads ENABLE ROW LEVEL SECURITY;

-- RLS policies added later once has_project_access function exists
