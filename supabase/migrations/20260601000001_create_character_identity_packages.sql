-- CHARACTER IDENTITY PACKAGE SYSTEM
--
-- The Character Identity Package (CIP) is the stable visual identity artifact
-- for each character, derived from Visual DNA + Wardrobe + Production Design.
--
-- CIP represents THE CHARACTER, not THE ACTOR.
-- CIP answers: "What does this character look like inside the story world?"
-- CIP does NOT answer: "Who is portraying this character?"
--
-- Ownership: Visual Production OS
-- Consumers: Hero Frames, Lookbooks, Posters, Storyboards, Visual Units, VPB
-- Non-consumers: AI Actors, Voice systems, Motion systems, Video systems
--
-- See: cast-hero-frame-architecture-revision-v2-2026-05-31.md
--   Constitutional Rule: CIP represents THE CHARACTER, not THE ACTOR
--   Asset Classification: CIP outputs are character_production assets
--
-- Feature gate: ENABLE_CIP_PIPELINE (default false)

BEGIN;

CREATE TABLE IF NOT EXISTS public.character_identity_packages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  character_id      UUID REFERENCES public.project_characters(id) ON DELETE SET NULL,
  character_name    TEXT NOT NULL,
  visual_dna_id     UUID REFERENCES public.character_visual_dna(id) ON DELETE SET NULL,

  -- Identity data (structured from visual DNA inferred_guidance)
  face_traits           JSONB DEFAULT '[]'::jsonb,
  age_range             TEXT DEFAULT '',
  ethnicity             JSONB DEFAULT '[]'::jsonb,
  body_traits           JSONB DEFAULT '[]'::jsonb,
  silhouette            TEXT DEFAULT '',
  visual_descriptors    JSONB DEFAULT '[]'::jsonb,

  -- Wardrobe & appearance signals
  wardrobe_signals      JSONB DEFAULT '[]'::jsonb,
  appearance_constraints JSONB DEFAULT '[]'::jsonb,
  style_guidance        JSONB DEFAULT '[]'::jsonb,

  -- Asset classification
  asset_class           TEXT NOT NULL DEFAULT 'character_production'
                        CHECK (asset_class IN (
                          'character_production',
                          'casting_reference',
                          'actor_attachment',
                          'performance_reference'
                        )),

  -- Provenance
  evidence              JSONB DEFAULT '{}'::jsonb,
  generated_by          TEXT NOT NULL DEFAULT 'system',
  version_number        INTEGER NOT NULL DEFAULT 1,
  is_current            BOOLEAN NOT NULL DEFAULT true,

  -- Feature gate
  enabled               BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE(project_id, character_name, version_number)
);

-- Indexes for common query patterns
CREATE INDEX idx_cip_project ON public.character_identity_packages(project_id);
CREATE INDEX idx_cip_character ON public.character_identity_packages(character_id);
CREATE INDEX idx_cip_current ON public.character_identity_packages(project_id, is_current) WHERE is_current = true;
CREATE INDEX idx_cip_visual_dna ON public.character_identity_packages(visual_dna_id);

-- Enable RLS
ALTER TABLE public.character_identity_packages ENABLE ROW LEVEL SECURITY;

-- RLS: users can read CIP for their projects
CREATE POLICY cip_select_policy ON public.character_identity_packages
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- RLS: only service role can insert/update
CREATE POLICY cip_insert_policy ON public.character_identity_packages
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY cip_update_policy ON public.character_identity_packages
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_cip_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cip_updated_at
  BEFORE UPDATE ON public.character_identity_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_cip_timestamp();

COMMIT;
