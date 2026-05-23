-- Migration: create obligation_topology_cache table
-- Created: 2026-05-23
-- Description: Cache table for obligation topology computation results

CREATE TABLE IF NOT EXISTS public.obligation_topology_cache (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id      uuid NOT NULL,
  version_id    uuid REFERENCES public.project_document_versions(id) ON DELETE SET NULL,
  input_hash    text NOT NULL,
  topology_state jsonb NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  revalidated_at timestamptz,

  CONSTRAINT obligation_topology_cache_pkey PRIMARY KEY (id),
  CONSTRAINT obligation_topology_cache_project_scene_unique UNIQUE (project_id, scene_id)
);

CREATE INDEX IF NOT EXISTS idx_otc_project ON public.obligation_topology_cache (project_id);
CREATE INDEX IF NOT EXISTS idx_otc_scene   ON public.obligation_topology_cache (scene_id);

ALTER TABLE public.obligation_topology_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "otc_select" ON public.obligation_topology_cache FOR SELECT
  TO authenticated USING (has_project_access(auth.uid(), project_id));

CREATE POLICY "otc_insert" ON public.obligation_topology_cache FOR INSERT
  TO authenticated WITH CHECK (has_project_access(auth.uid(), project_id));

CREATE POLICY "otc_update" ON public.obligation_topology_cache FOR UPDATE
  TO authenticated USING (has_project_access(auth.uid(), project_id));