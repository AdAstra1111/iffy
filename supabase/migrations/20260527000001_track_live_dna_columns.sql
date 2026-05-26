-- Track live schema drift: character_visual_dna columns added via
-- Supabase Dashboard but missing from tracked migrations.
--
-- These columns exist in the production database and are actively
-- selected by frontend code. This migration tracks them so fresh
-- DBs created from migrations are complete.
--
-- No data migration — columns already exist in production.

BEGIN;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS traits_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS physical_categories JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS binding_markers JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;