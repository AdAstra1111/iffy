-- Add axis_key column to scene_spine_links (schema drift fix)
ALTER TABLE scene_spine_links ADD COLUMN IF NOT EXISTS axis_key text;

