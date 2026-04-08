
-- Poster Candidates: top 1-3 commercially viable images from hero/approved pools
CREATE TABLE IF NOT EXISTS public.poster_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_image_id uuid NOT NULL,
  rank_position integer NOT NULL DEFAULT 1,
  score_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_score numeric NOT NULL DEFAULT 0,
  selection_mode text NOT NULL DEFAULT 'auto',
  selected_by uuid,
  status text NOT NULL DEFAULT 'candidate',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poster_candidates_project ON public.poster_candidates(project_id);
CREATE INDEX IF NOT EXISTS idx_poster_candidates_status ON public.poster_candidates(project_id, status);

ALTER TABLE public.poster_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project poster candidates"
  ON public.poster_candidates FOR SELECT
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can manage own project poster candidates"
  ON public.poster_candidates FOR ALL
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id))
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

-- Concept Brief Versions: curated 8-image executive artifact
CREATE TABLE IF NOT EXISTS public.concept_brief_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL DEFAULT 'Executive Concept Brief',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_selections jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_concept_brief_project ON public.concept_brief_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_concept_brief_status ON public.concept_brief_versions(project_id, status);

ALTER TABLE public.concept_brief_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project concept briefs"
  ON public.concept_brief_versions FOR SELECT
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can manage own project concept briefs"
  ON public.concept_brief_versions FOR ALL
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id))
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

-- Triggers for updated_at
CREATE TRIGGER set_poster_candidates_updated_at
  BEFORE UPDATE ON public.poster_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_concept_brief_versions_updated_at
  BEFORE UPDATE ON public.concept_brief_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
