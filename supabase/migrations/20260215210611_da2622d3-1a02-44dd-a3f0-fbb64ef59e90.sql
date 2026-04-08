
ALTER TABLE public.auto_run_jobs
  ADD COLUMN IF NOT EXISTS follow_latest boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS resume_document_id uuid NULL,
  ADD COLUMN IF NOT EXISTS resume_version_id uuid NULL;
