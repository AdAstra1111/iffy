
-- Add socio-economic hierarchy fields to location_visual_datasets
ALTER TABLE public.location_visual_datasets
  ADD COLUMN IF NOT EXISTS status_tier text NOT NULL DEFAULT 'working'
    CHECK (status_tier IN ('poor', 'working', 'elite', 'imperial')),
  ADD COLUMN IF NOT EXISTS material_privilege jsonb NOT NULL DEFAULT '{"allowed":[],"restricted":[],"signature":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS craft_level text NOT NULL DEFAULT 'functional'
    CHECK (craft_level IN ('rough', 'functional', 'refined', 'ceremonial')),
  ADD COLUMN IF NOT EXISTS density_profile jsonb NOT NULL DEFAULT '{"clutter":"medium","object_density":"balanced","negative_space":"moderate"}'::jsonb,
  ADD COLUMN IF NOT EXISTS spatial_intent jsonb NOT NULL DEFAULT '{"purpose":"lived_in","symmetry":"none","flow":"organic"}'::jsonb,
  ADD COLUMN IF NOT EXISTS material_hierarchy jsonb NOT NULL DEFAULT '{"primary":[],"secondary":[],"forbidden":[]}'::jsonb;
