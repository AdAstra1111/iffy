-- Location Atomiser Migration
-- Phase 5: Location atoms use the existing atoms table (atom_type='location')
-- and existing visual_database, narrative_entities tables.
-- This migration just ensures we have efficient indexes for location queries.

-- Index on atoms(project_id, atom_type) — covers location queries
CREATE INDEX IF NOT EXISTS idx_atoms_project_atom_type
  ON atoms(project_id, atom_type);

-- Index on narrative_entities(project_id, entity_type) — for location entity queries
CREATE INDEX IF NOT EXISTS idx_narrative_entities_project_entity_type
  ON narrative_entities(project_id, entity_type);

-- Index on narrative_scene_entity_links(entity_id, relation_type) — for location_present counts
CREATE INDEX IF NOT EXISTS idx_narrative_scene_entity_links_entity_relation
  ON narrative_scene_entity_links(entity_id, relation_type);
