/**
 * Scene Index IEL Validator — Deterministic validation of scene index entries.
 *
 * IEL-enforced invariants:
 * - character_keys must not be empty
 * - wardrobe_state_map keys must be a subset of character_keys
 * - all character_keys must have a wardrobe_state_map entry
 * - no unknown characters (when project characters provided)
 * - no orphan wardrobe states (when project states provided)
 */

import type { SceneIndexInsert, SceneIndexValidationResult } from './types';

export interface SceneIndexValidationContext {
  /** Known character keys in the project (normalized lowercase) */
  projectCharacterKeys?: string[];
  /** Known wardrobe state keys per character: { character_key: state_key[] } */
  projectWardrobeStates?: Record<string, string[]>;
}

/**
 * validate_scene_index — IEL-enforced validation.
 * Fail-closed: any violation → reject.
 */
export function validateSceneIndex(
  scene: SceneIndexInsert,
  context?: SceneIndexValidationContext
): SceneIndexValidationResult {
  const errors: string[] = [];

  // 1. character_keys must not be empty
  if (!scene.character_keys || scene.character_keys.length === 0) {
    errors.push(`Scene ${scene.scene_number}: character_keys must not be empty`);
  }

  // 2. wardrobe_state_map keys must be subset of character_keys
  const charSet = new Set(scene.character_keys || []);
  const mapKeys = Object.keys(scene.wardrobe_state_map || {});
  for (const mk of mapKeys) {
    if (!charSet.has(mk)) {
      errors.push(`Scene ${scene.scene_number}: wardrobe_state_map key "${mk}" is not in character_keys`);
    }
  }

  // 3. All character_keys must have a wardrobe_state_map entry
  for (const ck of scene.character_keys || []) {
    if (!(scene.wardrobe_state_map || {})[ck]) {
      errors.push(`Scene ${scene.scene_number}: character "${ck}" missing from wardrobe_state_map`);
    }
  }

  // 4. No unknown characters (when context provided)
  if (context?.projectCharacterKeys) {
    const knownSet = new Set(context.projectCharacterKeys);
    for (const ck of scene.character_keys || []) {
      if (!knownSet.has(ck)) {
        errors.push(`Scene ${scene.scene_number}: unknown character "${ck}" not in project`);
      }
    }
  }

  // 5. No orphan wardrobe states (when context provided)
  if (context?.projectWardrobeStates) {
    for (const [ck, stateKey] of Object.entries(scene.wardrobe_state_map || {})) {
      const validStates = context.projectWardrobeStates[ck];
      if (validStates && !validStates.includes(stateKey)) {
        errors.push(`Scene ${scene.scene_number}: wardrobe state "${stateKey}" not valid for character "${ck}" (valid: ${validStates.join(', ')})`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Batch validate an array of scene index entries.
 * Returns aggregated result.
 */
export function validateSceneIndexBatch(
  scenes: SceneIndexInsert[],
  context?: SceneIndexValidationContext
): SceneIndexValidationResult {
  const allErrors: string[] = [];
  for (const scene of scenes) {
    const result = validateSceneIndex(scene, context);
    allErrors.push(...result.errors);
  }

  // Check for duplicate scene_numbers
  const numbers = scenes.map(s => s.scene_number);
  const dups = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (dups.length > 0) {
    allErrors.push(`Duplicate scene_numbers: ${[...new Set(dups)].join(', ')}`);
  }

  return { valid: allErrors.length === 0, errors: allErrors };
}
