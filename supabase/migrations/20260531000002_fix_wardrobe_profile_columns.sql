-- Add missing columns to character_wardrobe_profiles table
-- These columns are referenced by generate-visual-dna-from-canon
-- but were never added to the production table.

ALTER TABLE character_wardrobe_profiles 
ADD COLUMN IF NOT EXISTS garments JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS fabric_language TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS palette_logic TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS silhouette_language TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS package_strength TEXT DEFAULT 'unassessed',
ADD COLUMN IF NOT EXISTS extraction_version TEXT DEFAULT 'g7_auto',
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'generate-visual-dna-from-canon',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Unique constraint needed for upsert on (project_id, character_name, is_current)
ALTER TABLE character_wardrobe_profiles
ADD CONSTRAINT unique_project_character_current 
  UNIQUE (project_id, character_name, is_current);