-- Production Design — Structured tables for G2 and G5
--
-- G2: production_design_character_wardrobe — Character-level PD data
-- G5: character_wardrobe_profiles — Structured wardrobe profiles table
--
-- Moves data from canon_json.character_wardrobe_profiles (unstructured JSONB)
-- into queryable relational tables. Provides the schema home PD data was missing.

BEGIN;

-- ── G5: character_wardrobe_profiles table ──────────────────────────────
-- Normalized table replacing canon_json -> character_wardrobe_profiles
-- Each row = one character's wardrobe profile with structured garment data.

CREATE TABLE IF NOT EXISTS public.character_wardrobe_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  character_name  TEXT NOT NULL,
  profile_version INTEGER NOT NULL DEFAULT 1,
  is_current      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Garment catalog: array of {garment_id, name, type, description, fabric, color_palette, source}
  garments        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Fabric language / silhouette description
  fabric_language     TEXT,
  palette_logic       TEXT,
  silhouette_language TEXT,
  damage_wear_logic   TEXT,

  -- Identity summary (used for effective wardrobe resolution)
  identity_summary    TEXT,

  -- State matrix: maps state_key -> {garment_adjustments, fabric_adjustments, grooming_adjustments, explicit_or_inferred}
  state_matrix        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Extraction provenance
  extraction_version  TEXT,
  source              TEXT DEFAULT 'canon_extraction',

  -- Package strength (auto-calculated in G7)
  package_strength    TEXT CHECK (package_strength IN ('strong', 'moderate', 'weak', 'blocked', 'unassessed')) DEFAULT 'unassessed',

  -- Uniqueness constraint
  UNIQUE (project_id, character_name, is_current)
);

-- ── G2: production_design_character_wardrobe table ─────────────────────
-- Character-level Production Design data.
-- Each row captures a character's PD identity: garment types, fabric families,
-- color palettes, and state-binding rules per production design slot.

CREATE TABLE IF NOT EXISTS public.production_design_character_wardrobe (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  visual_set_id   UUID REFERENCES public.visual_sets(id) ON DELETE SET NULL,
  character_name  TEXT NOT NULL,
  is_current      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Garment families: array of {family_id, name, garment_type, fabric_family, color_family, priority}
  garment_families JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Fabric families: array of {fabric_id, name, weight, drape, texture, usage_context}
  fabric_families   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Color palette definition: {primary, secondary, accent, skin_tone_compat}
  color_palette     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Silhouette definition
  silhouette_profile TEXT,

  -- State binding rules: array of {state_key, garment_family_ids, fabric_family_ids, color_adjustments, priority}
  state_bindings    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Slot count / package metrics
  required_slot_count INTEGER DEFAULT 0,
  package_strength    TEXT CHECK (package_strength IN ('strong', 'moderate', 'weak', 'blocked', 'unassessed')) DEFAULT 'unassessed',

  -- Auto-population tracking
  auto_populated     BOOLEAN DEFAULT false,
  extraction_source  TEXT,
  last_extracted_at  TIMESTAMPTZ,

  -- Uniqueness constraint
  UNIQUE (project_id, character_name, is_current)
);

-- ── Indexes ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_character_wardrobe_profiles_project
  ON public.character_wardrobe_profiles(project_id);

CREATE INDEX IF NOT EXISTS idx_character_wardrobe_profiles_current
  ON public.character_wardrobe_profiles(project_id, is_current);

CREATE INDEX IF NOT EXISTS idx_production_design_character_wardrobe_project
  ON public.production_design_character_wardrobe(project_id);

CREATE INDEX IF NOT EXISTS idx_production_design_character_wardrobe_current
  ON public.production_design_character_wardrobe(project_id, is_current);

-- ── RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.character_wardrobe_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_design_character_wardrobe ENABLE ROW LEVEL SECURITY;

-- Service role access (edge functions)
CREATE POLICY "service_role_all_character_wardrobe_profiles"
  ON public.character_wardrobe_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_production_design_character_wardrobe"
  ON public.production_design_character_wardrobe
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: read own project data
CREATE POLICY "authenticated_read_character_wardrobe_profiles"
  ON public.character_wardrobe_profiles
  FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT id FROM public.projects));

CREATE POLICY "authenticated_read_production_design_character_wardrobe"
  ON public.production_design_character_wardrobe
  FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT id FROM public.projects));

COMMIT;
