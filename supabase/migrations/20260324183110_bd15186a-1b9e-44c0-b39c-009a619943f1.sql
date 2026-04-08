
CREATE TABLE IF NOT EXISTS public.lookbook_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  scene_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, scene_number)
);

ALTER TABLE public.lookbook_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own lookbook pages"
  ON public.lookbook_pages FOR SELECT
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can insert own lookbook pages"
  ON public.lookbook_pages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update own lookbook pages"
  ON public.lookbook_pages FOR UPDATE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete own lookbook pages"
  ON public.lookbook_pages FOR DELETE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));

CREATE TRIGGER set_lookbook_pages_updated_at
  BEFORE UPDATE ON public.lookbook_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
