-- CANONICAL WARDROBE STATE SYSTEM
--
-- Establishes the missing wardrobe layer between Identity Canon and Production Design.
-- Wardrobe states are derived from narrative truth, not manual creation.
--
-- Schema design:
--   1. wardrobe_state_taxonomy — canonical, project-agnostic state definitions
--   2. character_wardrobe_profiles — per-character state assignments
--   3. state_narrative_bindings — scene-level state assignments from narrative context

BEGIN;

-- ── 1. WARDROBE STATE TAXONOMY ─────────────────────────────────
-- Project-agnostic canonical state definitions.
-- Reusable across all projects, not YETI-specific.

CREATE TABLE IF NOT EXISTS public.wardrobe_state_taxonomy (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_key       TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  base_state      TEXT,  -- parent state, if this is a sub-state
  priority        INTEGER NOT NULL DEFAULT 0,  -- higher = more specific
  applies_to      TEXT[] NOT NULL DEFAULT '{}',  -- role filters: 'protagonist', 'antagonist', 'supporting', 'minor', 'creature'
  narrative_tags  TEXT[] NOT NULL DEFAULT '{}',  -- automatic triggers: 'cold_climate', 'formal_event'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the canonical taxonomy
INSERT INTO wardrobe_state_taxonomy (state_key, display_name, description, base_state, priority, applies_to, narrative_tags) VALUES
  ('base',         'Base Appearance',     'Default civilian appearance. Neutral baseline wardrobe.', NULL, 0, '{protagonist,antagonist,supporting,minor}', '{}'),
  ('domestic',     'Domestic / Private',  'At-home or private quarters. Casual, relaxed attire.', 'base', 10, '{protagonist,supporting}', '{private_scene,quiet_moment}'),
  ('travel',       'Travel / Journey',    'En route between locations. Practical, durable clothing.', 'base', 10, '{protagonist,supporting,minor}', '{journey,travel,transport}'),
  ('operational',  'Operational / Field', 'Active mission or field work. Tactical, mission-ready.', 'base', 20, '{protagonist,antagonist,supporting}', '{field_work,mission,operation}'),
  ('work',         'Work / Labor',        'Occupational attire. Trade-specific clothing.', 'base', 10, '{protagonist,supporting,minor}', '{work,labor,occupation}'),
  ('public_formal','Public / Formal',     'Formal or public-facing appearance. Ceremonial, diplomatic.', 'base', 15, '{protagonist,antagonist,supporting}', '{formal_event,ceremony,public_appearance}'),
  ('intimate_private','Intimate / Private','Vulnerable or private moments. Undressed, relaxed.', 'base', 5, '{protagonist,supporting}', '{intimate_scene,private_moment}'),
  ('cold_weather', 'Cold Weather',        'Cold climate or winter attire. Heavy coats, layers.', 'base', 15, '{protagonist,antagonist,supporting,minor}', '{cold_climate,winter,mountain,snow}'),
  ('hot_weather',  'Hot Weather',         'Hot climate attire. Light, breathable fabrics.', 'base', 15, '{protagonist,antagonist,supporting,minor}', '{hot_climate,desert,tropical}'),
  ('combat',       'Combat / Action',     'Active combat. Battle-ready gear, armor if applicable.', 'base', 25, '{protagonist,antagonist,supporting}', '{combat,battle,firefight}'),
  ('disguise',     'Disguise / Concealment','Undercover or disguised appearance.', 'base', 30, '{protagonist,antagonist,supporting}', '{disguise,undercover,infiltration}'),
  ('distress',     'Distress / Damage',   'Injured, damaged, or stressed state. Torn, bloodied, dishevelled.', 'base', 30, '{protagonist,antagonist,supporting}', '{injury,capture,escape,collapse}'),
  ('aftermath',    'Aftermath / Recovery','Post-climax or recovery state. Unkempt, exhausted.', 'distress', 35, '{protagonist,antagonist,supporting}', '{aftermath,recovery,denouement}'),
  ('ceremonial',   'Ceremonial / Dress',  'Full ceremonial or dress uniform. Highest formality.', 'public_formal', 20, '{antagonist,military,official}', '{ceremony,parade,official_event}'),
  ('command',      'Command / Authority', 'Authoritative presence. Officer or leadership attire.', 'public_formal', 20, '{antagonist,protagonist}', '{command,leadership,authority}')
ON CONFLICT (state_key) DO NOTHING;

-- ── 2. CHARACTER WARDROBE PROFILES ──────────────────────────────
-- Per-character state assignments.
-- Each row links a character to the wardrobe states relevant to their narrative arc.

CREATE TABLE IF NOT EXISTS public.character_wardrobe_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  character_name    TEXT NOT NULL,
  profile_version   INTEGER NOT NULL DEFAULT 1,
  is_current        BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Active wardrobe states for this character (ordered by narrative progression)
  active_states     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Each entry: { state_key, display_name, order, narrative_context }

  UNIQUE(project_id, character_name, profile_version)
);

CREATE INDEX IF NOT EXISTS idx_char_wardrobe_project ON public.character_wardrobe_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_char_wardrobe_current ON public.character_wardrobe_profiles(project_id, is_current);

-- ── 3. SCENE WARDROBE ASSIGNMENTS ───────────────────────────────
-- Maps scene index entries to character wardrobe states.
-- This is what the hero frame and costume generation pipelines read.

CREATE TABLE IF NOT EXISTS public.scene_wardrobe_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_number      TEXT NOT NULL,
  character_name    TEXT NOT NULL,
  wardrobe_state    TEXT NOT NULL REFERENCES public.wardrobe_state_taxonomy(state_key),
  confidence        TEXT NOT NULL DEFAULT 'derived',  -- 'derived' | 'explicit' | 'manual'
  source            TEXT NOT NULL DEFAULT 'narrative_inference',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, scene_number, character_name, wardrobe_state)
);

CREATE INDEX IF NOT EXISTS idx_scene_wardrobe_scene ON public.scene_wardrobe_assignments(project_id, scene_number);

COMMIT;