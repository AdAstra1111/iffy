-- Migration: audio_jobs table for IFFY Audio Pipeline
-- Created: 2026-05-02
-- Purpose: Job tracking table for audio export pipeline
-- RLS: auth.uid() = owner_id for all operations

-- ── Table: audio_jobs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audio_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'error')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  message TEXT,
  output_url TEXT,
  options JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS audio_jobs_project_id_idx ON audio_jobs(project_id);
CREATE INDEX IF NOT EXISTS audio_jobs_owner_id_idx ON audio_jobs(owner_id);
CREATE INDEX IF NOT EXISTS audio_jobs_status_idx ON audio_jobs(status);
CREATE INDEX IF NOT EXISTS audio_jobs_created_at_idx ON audio_jobs(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER audio_jobs_updated_at
  BEFORE UPDATE ON audio_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS Policies ─────────────────────────────────────────────────────────────
ALTER TABLE audio_jobs ENABLE ROW LEVEL SECURITY;

-- Owner can read their own jobs
CREATE POLICY "audio_jobs_owner_read" ON audio_jobs
  FOR SELECT USING (auth.uid() = owner_id);

-- Owner can insert jobs for their projects
CREATE POLICY "audio_jobs_owner_insert" ON audio_jobs
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Owner can update their own jobs (for progress tracking)
CREATE POLICY "audio_jobs_owner_update" ON audio_jobs
  FOR UPDATE USING (auth.uid() = owner_id);

-- Owner can delete their own jobs
CREATE POLICY "audio_jobs_owner_delete" ON audio_jobs
  FOR DELETE USING (auth.uid() = owner_id);

-- ── Storage bucket: audio-exports ───────────────────────────────────────────
-- Create a dedicated bucket for audio exports (separate from project-posters)
-- Use Supabase Storage API after migration to create this bucket, or via dashboard:
-- Storage → New Bucket → Name: "audio-exports", Public: false
--
-- The Edge Function also attempts to create this bucket on first run if it doesn't exist.
