-- project_visual_language — Visual language/style profile per project
--
-- Stores the derived visual style profile (era, cultural context, lighting,
-- camera, composition, texture, environment realism) used by:
-- - generate-hero-frames (resolveVisualStyleProfile for [VISUAL STYLE AUTHORITY] prompt block)
-- - hero-frame-preflight (governance check)
-- - lookbook-preflight (governance check)
-- - generate-visual-dna-from-canon (G6 auto-populate)
--
-- Each project has at most one active row (queried by ordering created_at DESC).

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_visual_language (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  style_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast project lookups
CREATE INDEX IF NOT EXISTS idx_project_visual_language_project_id
  ON public.project_visual_language (project_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_project_visual_language_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_visual_language_updated_at
  ON public.project_visual_language;

CREATE TRIGGER trg_project_visual_language_updated_at
  BEFORE UPDATE ON public.project_visual_language
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_visual_language_updated_at();

COMMIT;