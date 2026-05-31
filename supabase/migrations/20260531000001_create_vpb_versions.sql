-- VPB Versions — Canonical Visual Production Bible versioning table.
-- Each row is a complete VPB snapshot. Versioning mirrors Document OS.
-- The VPB is a deterministic assembly, not a generation — no LLM involved.

CREATE TABLE IF NOT EXISTS public.vpb_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Versioning
  version_number INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'complete', 'archived', 'failed')),
  
  -- The VPB content (complete structured JSON)
  vpb_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Assembly provenance
  nel_run_at TIMESTAMPTZ,
  corpus_hash TEXT,
  source_document_ids UUID[] NOT NULL DEFAULT '{}',
  source_document_version_ids UUID[] NOT NULL DEFAULT '{}',
  assembly_duration_ms INTEGER,
  section_count INTEGER NOT NULL DEFAULT 0,
  asset_count INTEGER NOT NULL DEFAULT 0,
  generated_by TEXT NOT NULL DEFAULT 'vpb-assembly-engine',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Enforce one current version per project
  UNIQUE(project_id, version_number)
);

-- Index for finding current version per project
CREATE INDEX IF NOT EXISTS idx_vpb_versions_project_current 
  ON public.vpb_versions(project_id) WHERE is_current = true;

-- RLS
ALTER TABLE public.vpb_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read VPB versions for accessible projects"
  ON public.vpb_versions FOR SELECT TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can insert VPB versions for accessible projects"
  ON public.vpb_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update VPB versions for accessible projects"
  ON public.vpb_versions FOR UPDATE TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete VPB versions for accessible projects"
  ON public.vpb_versions FOR DELETE TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

-- Auto-update updated_at
CREATE TRIGGER set_vpb_versions_updated_at
  BEFORE UPDATE ON public.vpb_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
