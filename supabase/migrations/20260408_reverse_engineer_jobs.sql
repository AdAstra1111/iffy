-- Migration: reverse_engineer_jobs + reverse_engineer_stages
-- For tracking async reverse-engineer-script job progress

BEGIN;

CREATE TABLE IF NOT EXISTS reverse_engineer_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  script_document_id uuid REFERENCES project_documents(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','error')),
  error       text,
  result_doc_id uuid,  -- the concept_brief doc created
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reverse_engineer_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES reverse_engineer_jobs(id) ON DELETE CASCADE,
  stage_key   text NOT NULL,  -- 'analyze_structure', 'extract_characters', etc.
  stage_label text NOT NULL,  -- 'Analyzing script structure...'
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','error')),
  error       text,
  output      jsonb,  -- stage-specific output data
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_jobs_project_id  ON reverse_engineer_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_re_stages_job_id    ON reverse_engineer_stages(job_id);

END;
