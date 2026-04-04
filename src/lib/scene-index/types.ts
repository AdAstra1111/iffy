/**
 * Scene Index — Lightweight binding layer: scene → location → characters → wardrobe states.
 * Bridges narrative structure to visual production (Lookbook, Costume system).
 *
 * IEL: This is a STRUCTURE + BINDING layer only. No generation logic.
 */

export interface SceneIndex {
  id: string;
  project_id: string;
  scene_number: number;
  title: string | null;
  source_doc_type: 'story_outline' | 'beat_sheet' | 'script';
  source_ref: Record<string, any>;
  location_key: string | null;
  character_keys: string[];
  wardrobe_state_map: Record<string, string>; // { character_key: state_key }
  created_at: string;
  updated_at: string;
}

export interface SceneIndexInsert {
  project_id: string;
  scene_number: number;
  title?: string | null;
  source_doc_type: 'story_outline' | 'beat_sheet' | 'script';
  source_ref?: Record<string, any>;
  location_key?: string | null;
  character_keys: string[];
  wardrobe_state_map: Record<string, string>;
}

export interface SceneIndexUpdate {
  title?: string | null;
  location_key?: string | null;
  character_keys?: string[];
  wardrobe_state_map?: Record<string, string>;
}

/** Validation result from IEL scene index validator */
export interface SceneIndexValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * SceneIndexReadiness — global readiness assessment for a project's Scene Index.
 * Used by downstream systems (Lookbook) to gate operations.
 */
export interface SceneIndexReadiness {
  /** Whether Scene Index is fully ready for consumption */
  ready: boolean;
  /** Number of valid scene_index entries */
  sceneCount: number;
  /** Number of scenes with missing character data */
  missingCharacters: number;
  /** Number of scenes with unknown wardrobe states */
  unknownWardrobeCount: number;
  /** Human-readable reason if not ready */
  reason: string | null;
}
